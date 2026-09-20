from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.optimizer import optimize_prompt, parse_script_to_shots, optimize_shot

router = APIRouter()


class OptimizeRequest(BaseModel):
    prompt: str
    category: str  # t2i, t2v, i2v, r2v


@router.post("/optimize")
async def api_optimize(req: OptimizeRequest):
    try:
        result = await optimize_prompt(req.prompt, req.category)
        return {"optimized_prompt": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ParseScriptRequest(BaseModel):
    raw_script: str


@router.post("/parse-script")
async def api_parse_script(req: ParseScriptRequest):
    try:
        shots = await parse_script_to_shots(req.raw_script)
        return {"shots": shots}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class OptimizeShotRequest(BaseModel):
    prompt: str
    voiceover: str = ""
    duration: int = 5


@router.post("/optimize-shot")
async def api_optimize_shot(req: OptimizeShotRequest):
    try:
        result = await optimize_shot(req.prompt, req.voiceover, req.duration)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
