from fastapi import APIRouter
from app.api.v1 import auth, study, coding, career, interview, dashboard, admin, study_planner

api_router = APIRouter()

# Include routes
api_router.include_router(auth.router)
api_router.include_router(study.router)
api_router.include_router(coding.router)
api_router.include_router(career.router)
api_router.include_router(interview.router)
api_router.include_router(dashboard.router)
api_router.include_router(admin.router)
api_router.include_router(study_planner.router)
