"""
LegalCheck AI — Backend
FastAPI application with OCR endpoint.
"""

import logging
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from fastapi import Header

from services.image_preprocessor import (
    PreprocessingLevel,
    get_image_dimensions,
    load_image_from_bytes,
    preprocess_image,
)
from services.image_validator import (
    ImageValidationError,
    get_image_info,
    validate_image,
)
from services.ocr_engine import get_ocr_backend, initialize_ocr, get_engine_status, self_test as ocr_self_test
from services.ocr_service import ocr_from_bytes
from services.scan_pipeline import analyze_image, analyze_images
from services.upload_handler import save_upload

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="LegalCheck AI Backend",
    version="0.2.0",
    description="OCR processing backend for packaged product compliance scanning",
)

# CORS — configurable via environment variable
# Default: localhost for development. Set CORS_ORIGINS for production.
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
).split(",")

cleaned_origins = [o.strip() for o in CORS_ORIGINS if o.strip()]

# Safety: if any origin is '*', log a warning and use only localhost
if '*' in cleaned_origins:
    logger.warning(
        "CORS_ORIGINS contains wildcard '*'. "
        "This is insecure with credentials. Falling back to localhost only."
    )
    cleaned_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cleaned_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(f"CORS configured for origins: {cleaned_origins}")

# ── Rate Limiting ──────────────────────────────────────────────────────────
# Lightweight in-memory rate limiter for scan endpoints.
# Protects expensive OCR processing without external infrastructure.
# Configurable via SCAN_RATE_LIMIT (requests per minute).

SCAN_RATE_LIMIT = int(os.environ.get("SCAN_RATE_LIMIT", "20"))  # requests per minute
RATE_LIMIT_WINDOW = 60  # seconds

_rate_limits: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(client_ip: str, endpoint: str) -> bool:
    """Check if a request is within the rate limit. Returns True if allowed."""
    now = time.time()
    key = f"{client_ip}:{endpoint}"

    # Remove timestamps outside the window
    _rate_limits[key] = [t for t in _rate_limits[key] if now - t < RATE_LIMIT_WINDOW]

    if len(_rate_limits[key]) >= SCAN_RATE_LIMIT:
        return False

    _rate_limits[key].append(now)
    return True

# ---------------------------------------------------------------------------
# Startup: initialize OCR engine
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    logger.info("Initializing OCR engine...")
    backend = initialize_ocr()
    status = get_engine_status()
    if status.initialized:
        logger.info(f"OCR engine ready: {backend} (v{status.package_version})")
    else:
        logger.error(f"OCR engine FAILED to initialize: {status.error}")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "ocr_backend": get_ocr_backend(),
    }


# ---------------------------------------------------------------------------
# POST /api/ocr — Main OCR endpoint
# ---------------------------------------------------------------------------
@app.post("/api/ocr")
async def process_ocr(
    request: Request,
    file: UploadFile = File(..., description="Product image to process"),
    preprocessing: str = Form(
        default="standard",
        description="Preprocessing level: none, light, standard, aggressive",
    ),
):
    """
    Accept an image, validate it, preprocess it, run OCR, and return results.

    Request: multipart/form-data with a 'file' field containing the image.
    Response: structured JSON with OCR results.
    """
    start_time = time.time()

    # ── Rate limit check ──
    client_ip = request.client.host if request and request.client else "unknown"
    if not _check_rate_limit(client_ip, "scan"):
        raise HTTPException(
            status_code=429,
            detail={
                "success": False,
                "error": "Too many scan requests. Please wait a moment and try again.",
                "code": "RATE_LIMITED",
                "retry_after_seconds": RATE_LIMIT_WINDOW,
            },
        )

    # ------------------------------------------------------------------
    # 1. Validate image
    # ------------------------------------------------------------------
    try:
        await validate_image(file)
    except ImageValidationError as e:
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": e.message, "code": e.code},
        )

    # ------------------------------------------------------------------
    # 2. Read file content (seek back after validation consumed it)
    # ------------------------------------------------------------------
    await file.seek(0)
    content = await file.read()
    image_info = get_image_info(content)
    logger.info(
        f"Processing: {file.filename} | {image_info['width']}x{image_info['height']} "
        f"| {image_info['format']} | {len(content)} bytes"
    )

    # ------------------------------------------------------------------
    # 3. Save to disk
    # ------------------------------------------------------------------
    saved = save_upload(content, file.filename or "upload.png")

    # ------------------------------------------------------------------
    # 4. Preprocess image
    # ------------------------------------------------------------------
    try:
        level = PreprocessingLevel(preprocessing)
    except ValueError:
        level = PreprocessingLevel.STANDARD

    preprocessing_start = time.time()
    preprocessing_result = preprocess_image(content, level=level)
    preprocessing_time = time.time() - preprocessing_start

    processed_img = preprocessing_result["processed"]
    processed_dims = get_image_dimensions(processed_img)

    # ------------------------------------------------------------------
    # 5. Run OCR
    # ------------------------------------------------------------------
    ocr_start = time.time()
    ocr_result = run_ocr(processed_img)
    ocr_time = time.time() - ocr_start

    total_time = time.time() - start_time

    # ------------------------------------------------------------------
    # 6. Build response
    # ------------------------------------------------------------------
    response = {
        "success": True,
        "text": ocr_result["full_text"],
        "lines": ocr_result["lines"],
        "metadata": {
            "backend": ocr_result["backend"],
            "line_count": ocr_result["line_count"],
            "avg_confidence": ocr_result["avg_confidence"],
            "preprocessing": {
                "level": level.value,
                "steps_applied": preprocessing_result["steps_applied"],
                "original_dimensions": {
                    "width": image_info["width"],
                    "height": image_info["height"],
                },
                "processed_dimensions": processed_dims,
            },
            "timing": {
                "total_seconds": round(total_time, 3),
                "preprocessing_seconds": round(preprocessing_time, 3),
                "ocr_seconds": round(ocr_time, 3),
            },
            "file": {
                "saved_filename": saved["filename"],
                "original_filename": saved["original_filename"],
                "size_bytes": saved["size_bytes"],
            },
        },
    }

    logger.info(
        f"OCR complete: {ocr_result['line_count']} lines | "
        f"{ocr_result['avg_confidence']:.1%} avg confidence | "
        f"{total_time:.2f}s total"
    )

    return response


# ---------------------------------------------------------------------------
# GET /uploads/{filename} — Serve uploaded images
# ---------------------------------------------------------------------------
@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded file for preview."""
    from services.upload_handler import get_upload_path

    file_path = get_upload_path(filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type from extension
    ext = file_path.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(file_path, media_type=media_type)


# ---------------------------------------------------------------------------
# GET /api/test-ocr — Developer test endpoint
# ---------------------------------------------------------------------------
@app.get("/api/test-ocr")
async def test_ocr():
    """
    Verify OCR engine is functional.
    Returns backend status and basic info.
    """
    status = get_engine_status()

    if not status.initialized:
        return {
            "status": "error",
            "message": f"OCR engine not ready: {status.error}",
            "engine": status.engine_name,
            "initialized": False,
        }

    return {
        "status": "ok",
        "message": f"{status.engine_name} is initialized and ready (v{status.package_version}).",
        "engine": status.engine_name,
        "initialized": True,
        "endpoints": {
            "ocr": "POST /api/ocr",
            "scan": "POST /api/scan",
            "status": "GET /api/ocr-status",
            "self-test": "GET /api/ocr-self-test",
            "health": "GET /api/health",
            "uploads": "GET /uploads/{filename}",
        },
    }


# ---------------------------------------------------------------------------
# GET /api/ocr-status — Diagnostic endpoint
# ---------------------------------------------------------------------------
@app.get("/api/ocr-status")
async def ocr_status():
    """
    Report OCR engine status for debugging.
    Returns truthful values about initialization state.
    """
    engine_status = get_engine_status()

    # Check OpenCV
    opencv_info = {"available": False, "version": ""}
    try:
        import cv2
        opencv_info["available"] = True
        opencv_info["version"] = cv2.__version__
    except ImportError:
        pass

    # Check rules directory
    rules_info = {"exists": False, "count": 0, "path": ""}
    for candidate in [
        Path(__file__).resolve().parent / "rules",
        Path(__file__).resolve().parent.parent / "rules",
    ]:
        if candidate.exists():
            rules_info["exists"] = True
            rules_info["count"] = len(list(candidate.glob("*.json")))
            rules_info["path"] = str(candidate)
            break

    return {
        "ocr_engine": engine_status.engine_name,
        "package_available": engine_status.package_available,
        "package_version": engine_status.package_version,
        "initialized": engine_status.initialized,
        "model_ready": engine_status.model_ready,
        "error": engine_status.error,
        "opencv": opencv_info,
        "rules": rules_info,
    }


# ---------------------------------------------------------------------------
# GET /api/ocr-self-test — Run OCR self-test with a local image
# ---------------------------------------------------------------------------
@app.get("/api/ocr-self-test")
async def ocr_self_test_endpoint():
    """
    Run a self-test of the OCR engine using a local test image.
    Does not require frontend — use for diagnostics.
    """
    return ocr_self_test()


# ---------------------------------------------------------------------------
# POST /api/scan — Full analysis pipeline (OCR → Fields → Rules → Report)
# ---------------------------------------------------------------------------
@app.post("/api/scan")
async def scan_product(
    request: Request,
    file: UploadFile = File(..., description="Product image to analyze"),
    preprocessing: str = Form(
        default="standard",
        description="Preprocessing level: none, light, standard, aggressive",
    ),
):
    """
    Full analysis pipeline: image → OCR → field extraction → rule engine → report.

    Returns:
        scan_id, ocr results, extracted fields, rule results, overall status.
    """
    start_time = time.time()

    # ── Rate limit check ──
    client_ip = request.client.host if request and request.client else "unknown"
    if not _check_rate_limit(client_ip, "scan"):
        raise HTTPException(
            status_code=429,
            detail={
                "success": False,
                "error": "Too many scan requests. Please wait a moment and try again.",
                "code": "RATE_LIMITED",
                "retry_after_seconds": RATE_LIMIT_WINDOW,
            },
        )

    logger.info(f"[/api/scan] Received request: filename={file.filename}, content_type={file.content_type}")

    # ------------------------------------------------------------------
    # 1. Read file content FIRST (before validation, which also reads)
    # ------------------------------------------------------------------
    content = await file.read()
    logger.info(f"[/api/scan] Read {len(content)} bytes from uploaded file")

    if len(content) == 0:
        logger.error(f"[/api/scan] File content is EMPTY")
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": "Uploaded file is empty", "code": "EMPTY_FILE"},
        )

    # ------------------------------------------------------------------
    # 2. Validate image (using the bytes we already read)
    # ------------------------------------------------------------------
    try:
        # Reset file position so validation can read it
        await file.seek(0)
        await validate_image(file)
        logger.info(f"[/api/scan] Image validation passed")
    except ImageValidationError as e:
        logger.error(f"[/api/scan] Image validation failed: {e.message}")
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": e.message, "code": e.code},
        )

    if len(content) == 0:
        logger.error(f"[/api/scan] File content is EMPTY")
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": "Uploaded file is empty", "code": "EMPTY_FILE"},
        )

    try:
        image_info = get_image_info(content)
        logger.info(
            f"[/api/scan] Image info: {image_info['width']}x{image_info['height']} "
            f"| {image_info['format']} | {len(content)} bytes"
        )
    except Exception as e:
        logger.error(f"[/api/scan] Failed to get image info: {e}")
        image_info = {"width": 0, "height": 0, "format": "unknown"}

    # ------------------------------------------------------------------
    # 3. Save to disk
    # ------------------------------------------------------------------
    saved = save_upload(content, file.filename or "upload.png")
    logger.info(f"[/api/scan] Saved to {saved['filename']}")

    # ------------------------------------------------------------------
    # 4. Run full analysis pipeline
    # ------------------------------------------------------------------
    try:
        logger.info(f"[/api/scan] Starting analysis pipeline...")
        result = analyze_image(
            image_bytes=content,
            filename=file.filename or "upload.png",
            preprocessing=preprocessing,
        )
        logger.info(f"[/api/scan] Pipeline completed: status={result.get('status')}, overall={result.get('overall_status')}")
    except Exception as e:
        logger.error(f"[/api/scan] Scan pipeline FAILED: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": f"Analysis pipeline failed: {str(e)}",
                "code": "PIPELINE_ERROR",
            },
        )

    # ------------------------------------------------------------------
    # 5. Add file metadata
    # ------------------------------------------------------------------
    result["file"] = {
        "saved_filename": saved["filename"],
        "original_filename": saved["original_filename"],
        "size_bytes": saved["size_bytes"],
        "url": f"/uploads/{saved['filename']}",
    }

    logger.info(
        f"[/api/scan] Response: scan_id={result['scan_id']} | "
        f"Status: {result['overall_status']} | "
        f"OCR engine: {result.get('ocr', {}).get('engine', 'N/A') if result.get('ocr') else 'N/A'} | "
        f"OCR lines: {result.get('ocr', {}).get('line_count', 0) if result.get('ocr') else 0} | "
        f"{result['timing'].get('total_seconds', 0):.2f}s total"
    )

    return result


# ---------------------------------------------------------------------------
# POST /api/scan-multi — Multi-image analysis pipeline
# ---------------------------------------------------------------------------
@app.post("/api/scan-multi")
async def scan_product_multi(
    request: Request,
    files: List[UploadFile] = File(..., description="2-3 images of the same product (Front, Back, Side)"),
    labels: str = Form(
        default="Front,Back,Side",
        description="Comma-separated labels for each image",
    ),
    preprocessing: str = Form(
        default="standard",
        description="Preprocessing level: none, light, standard, aggressive",
    ),
):
    """
    Multi-image analysis pipeline: multiple images of the same product
    → combined OCR → field extraction → rule engine → report.

    All uploaded images are treated as one product.  Fields found on ANY
    image count toward the final compliance score.
    """
    start_time = time.time()

    # Parse labels
    label_list = [l.strip() for l in labels.split(",") if l.strip()]
    # Pad labels to match file count
    while len(label_list) < len(files):
        label_list.append(f"Image {len(label_list) + 1}")

    logger.info(f"[/api/scan-multi] Received {len(files)} images: {label_list}")

    # Read and validate all files
    image_list = []
    for idx, (file, label) in enumerate(zip(files, label_list)):
        try:
            content = await file.read()
            if len(content) == 0:
                raise HTTPException(
                    status_code=400,
                    detail={"success": False, "error": f"File {idx + 1} ({label}) is empty", "code": "EMPTY_FILE"},
                )
            # Validate
            await file.seek(0)
            await validate_image(file)
            image_list.append({"bytes": content, "filename": file.filename or f"upload_{idx}.png", "label": label})
        except ImageValidationError as e:
            raise HTTPException(
                status_code=400,
                detail={"success": False, "error": f"File {idx + 1} ({label}): {e.message}", "code": e.code},
            )

    if len(image_list) == 0:
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": "No valid images provided", "code": "NO_IMAGES"},
        )

    # Save all uploads
    saved_files = []
    for img in image_list:
        saved = save_upload(img["bytes"], img["filename"])
        saved_files.append(saved)

    # Run multi-image analysis pipeline
    try:
        logger.info(f"[/api/scan-multi] Starting analysis pipeline on {len(image_list)} images...")
        result = analyze_images(
            image_list=image_list,
            preprocessing=preprocessing,
        )
        logger.info(f"[/api/scan-multi] Pipeline completed: status={result.get('status')}, overall={result.get('overall_status')}")
    except Exception as e:
        logger.error(f"[/api/scan-multi] Pipeline FAILED: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": f"Analysis pipeline failed: {str(e)}", "code": "PIPELINE_ERROR"},
        )

    # Add file metadata
    result["files"] = [
        {
            "saved_filename": sf["filename"],
            "original_filename": sf["original_filename"],
            "size_bytes": sf["size_bytes"],
            "url": f"/uploads/{sf['filename']}",
            "label": img["label"],
        }
        for sf, img in zip(saved_files, image_list)
    ]
    # Keep single-file metadata for backward compat with frontend
    result["file"] = result["files"][0] if result["files"] else None

    logger.info(
        f"[/api/scan-multi] Response: scan_id={result['scan_id']} | "
        f"Status: {result['overall_status']} | "
        f"Images: {len(image_list)} | "
        f"{result['timing'].get('total_seconds', 0):.2f}s total"
    )

    return result


# ---------------------------------------------------------------------------
# POST /api/delivery/webhook/shiprocket — Shiprocket tracking webhook
# ---------------------------------------------------------------------------
@app.post("/api/delivery/webhook/shiprocket")
async def shiprocket_webhook(
    payload: dict,
    x_api_key: Optional[str] = Header(None),
):
    """
    Receive tracking updates from Shiprocket.

    Shiprocket POSTs tracking updates to this URL with:
    - x-api-key header for authentication
    - JSON body with tracking data

    The endpoint validates the webhook, maps the status,
    and returns 200 to acknowledge receipt.

    NOTE: This endpoint updates the delivery record via Supabase
    client-side, which requires the service role key in the backend.
    In production, this would be called by Shiprocket's servers.
    """
    from services.delivery.service import validate_webhook_payload
    from services.delivery.shiprocket_provider import ShiprocketDeliveryProvider

    logger.info("[/api/delivery/webhook/shiprocket] Received webhook")

    # Validate the webhook
    if not validate_webhook_payload(payload, "shiprocket", x_api_key):
        logger.warning("[/api/delivery/webhook/shiprocket] Invalid webhook")
        raise HTTPException(status_code=401, detail="Invalid webhook authentication")

    # Extract tracking data
    # Shiprocket webhook payload structure varies, but typically includes:
    # { "awb": "...", "current_status": "...", "current_status_id": "...", ... }
    awb = payload.get("awb") or payload.get("awb_code")
    current_status_id = str(payload.get("current_status_id", ""))
    current_status = payload.get("current_status", "")

    if not awb:
        logger.warning("[/api/delivery/webhook/shiprocket] No AWB in payload")
        raise HTTPException(status_code=400, detail="Missing AWB in webhook payload")

    # Map Shiprocket status to internal status
    internal_status = ShiprocketDeliveryProvider.map_webhook_status(current_status_id)

    if internal_status is None:
        logger.info(
            f"[/api/delivery/webhook/shiprocket] Unmapped status: "
            f"{current_status_id} ({current_status}) — no action taken"
        )
        return {"status": "ok", "action": "ignored", "reason": "unmapped status"}

    logger.info(
        f"[/api/delivery/webhook/shiprocket] AWB={awb}, "
        f"status={current_status_id} → {internal_status}"
    )

    # NOTE: In a full implementation, this would:
    # 1. Look up the delivery record by awb_code
    # 2. Update the delivery status via Supabase RPC
    # 3. Sync order status if needed
    # For now, return the mapped status for the caller to handle
    return {
        "status": "ok",
        "awb": awb,
        "provider_status": current_status_id,
        "provider_status_text": current_status,
        "internal_status": internal_status,
    }


# ---------------------------------------------------------------------------
# GET /api/delivery/quote — Get delivery quote (backend call)
# ---------------------------------------------------------------------------
@app.post("/api/delivery/quote")
async def get_delivery_quote(
    pickup_address: dict,
    drop_address: dict,
    weight_kg: float = 1.0,
    order_amount: float = 0,
):
    """
    Get a delivery quote from the active provider.
    This is a backend endpoint — NOT exposed to the frontend directly.
    """
    from services.delivery.service import get_quote
    from services.delivery.provider import DeliveryProviderError

    try:
        quote = get_quote(pickup_address, drop_address, weight_kg, order_amount)
        return {
            "provider": quote.provider,
            "delivery_fee": quote.delivery_fee,
            "eta_minutes": quote.eta_minutes,
            "estimated_delivery_text": quote.estimated_delivery_text,
            "serviceable": quote.serviceable,
            "courier_options": quote.raw_response.get("data", {}).get("available_courier_companies", []) if quote.raw_response else [],
        }
    except DeliveryProviderError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"[/api/delivery/quote] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get delivery quote")


# ---------------------------------------------------------------------------
# POST /api/delivery/preview — Preview shipment payload (dry-run)
# ---------------------------------------------------------------------------
@app.post("/api/delivery/preview")
async def preview_delivery(
    pickup_address: dict,
    drop_address: dict,
    weight_kg: float,
    order_amount: float = 0,
    items_description: str = "",
    length_cm: float = 0,
    breadth_cm: float = 0,
    height_cm: float = 0,
    pickup_location: str = "",
    order_reference: str = "PREVIEW",
):
    """
    Preview the Shiprocket order payload WITHOUT creating anything.
    Returns the exact JSON that would be sent to Shiprocket.
    """
    from services.delivery.service import get_provider
    from services.delivery.provider import DeliveryProviderError

    try:
        provider = get_provider()
        if not hasattr(provider, 'preview_order_payload'):
            raise HTTPException(status_code=501, detail="Preview not supported for this provider")

        result = provider.preview_order_payload(
            pickup=__import__('services.delivery.models', fromlist=['Address']).Address.from_dict(pickup_address),
            drop=__import__('services.delivery.models', fromlist=['Address']).Address.from_dict(drop_address),
            weight_kg=weight_kg,
            order_reference=order_reference,
            order_amount=order_amount,
            items_description=items_description,
            length_cm=length_cm,
            breadth_cm=breadth_cm,
            height_cm=height_cm,
            pickup_location=pickup_location or None,
        )
        return result
    except DeliveryProviderError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"[/api/delivery/preview] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate preview")


# ---------------------------------------------------------------------------
# GET /api/delivery/provider-info — Get current provider info (backend only)
# ---------------------------------------------------------------------------
@app.get("/api/delivery/provider-info")
async def get_provider_info():
    """
    Return info about the currently configured delivery provider.
    Does NOT expose credentials.
    """
    import os
    provider_name = os.environ.get("DELIVERY_PROVIDER", "demo").lower().strip()
    return {
        "provider": provider_name,
        "display_name": "Shiprocket" if provider_name == "shiprocket" else "Demo delivery",
        "credentials_configured": bool(
            os.environ.get("SHIPROCKET_API_EMAIL") and os.environ.get("SHIPROCKET_API_PASSWORD")
        ) if provider_name == "shiprocket" else True,
    }


# ---------------------------------------------------------------------------
# Run directly: python main.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
