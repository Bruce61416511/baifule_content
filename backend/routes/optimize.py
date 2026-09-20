from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.optimizer import optimize_prompt

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
