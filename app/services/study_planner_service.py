"""
Study Planner Service — the AI engine that powers personalized study plan generation.

Implements:
- Priority scoring algorithm (local, no AI required)
- Proportional time distribution across subjects
- Daily/weekly plan generation with time-slot mapping
- Dynamic plan updates (completed/missed/rescheduled tasks)
- Pomodoro session tracking and streak management
- Productivity analytics computation
- AI-powered study recommendations (Gemini with rule-based fallback)
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.study import PlannerProfile, PlannerActivity, PlannerGoal, PlannerStreak


class StudyPlannerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Priority Scoring
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def calculate_priority_scores(self, subjects: List[dict]) -> List[dict]:
        """
        Computes a dynamic priority score for each subject based on:
        - Performance (lower marks → higher priority)
        - Weak topic count
        - Deadline proximity (closer exam → higher urgency)
        - Manual priority set by student
        
        Returns subjects enriched with 'priority_score' and 'priority_label'.
        """
        today = date.today()
        scored = []

        for subj in subjects:
            marks = float(subj.get("marks", 50))
            weak_count = len(subj.get("weak_topics", []))
            manual_priority = int(subj.get("priority", 5))
            exam_date_str = subj.get("exam_date")

            # Performance factor: lower marks → higher score (0-30 points)
            performance_score = (100 - marks) * 0.30

            # Weak topics factor: each weak topic adds 8 points (0-40 range typical)
            weak_score = weak_count * 8

            # Deadline factor: closer exam → higher urgency (0-100 points)
            deadline_score = 0
            days_remaining = None
            if exam_date_str:
                try:
                    exam_date = datetime.strptime(exam_date_str, "%Y-%m-%d").date()
                    days_remaining = (exam_date - today).days
                    if days_remaining < 0:
                        days_remaining = 0
                    deadline_score = max(0, 100 - days_remaining * 10) * 0.25
                except (ValueError, TypeError):
                    pass

            # Manual importance (1-10 → scaled to 0-50)
            manual_score = manual_priority * 5

            # Total priority score
            total = performance_score + weak_score + deadline_score + manual_score

            # Determine label
            if total >= 55:
                label = "High"
            elif total >= 30:
                label = "Medium"
            else:
                label = "Low"

            scored.append({
                **subj,
                "priority_score": round(total, 1),
                "priority_label": label,
                "days_remaining": days_remaining
            })

        # Sort descending by priority score
        scored.sort(key=lambda s: s["priority_score"], reverse=True)
        return scored

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Time Distribution
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def distribute_time(self, scored_subjects: List[dict], total_minutes: int) -> List[dict]:
        """
        Distributes available study time across subjects proportionally to priority scores.
        Enforces a minimum of 15 minutes per subject.
        """
        if not scored_subjects:
            return []

        total_score = sum(s["priority_score"] for s in scored_subjects)
        if total_score == 0:
            # Equal distribution
            per_subject = total_minutes // len(scored_subjects)
            for s in scored_subjects:
                s["allocated_minutes"] = per_subject
            return scored_subjects

        # Proportional allocation
        allocated = []
        remaining = total_minutes
        for s in scored_subjects:
            ratio = s["priority_score"] / total_score
            minutes = max(15, round(total_minutes * ratio))
            s["allocated_minutes"] = minutes
            allocated.append(s)

        # Adjust to match total (handle rounding)
        current_total = sum(s["allocated_minutes"] for s in allocated)
        diff = total_minutes - current_total
        if diff != 0 and allocated:
            # Add/subtract from highest priority subject
            allocated[0]["allocated_minutes"] += diff

        return allocated

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Study Plan Generation
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    def _get_start_hour(self, preferred_time: str) -> int:
        """Maps preferred study time to starting hour."""
        mapping = {
            "Morning": 6,
            "Afternoon": 12,
            "Evening": 16,
            "Night": 20,
        }
        return mapping.get(preferred_time, 16)

    def generate_daily_activities(
        self,
        user_id: uuid.UUID,
        scored_subjects: List[dict],
        target_date: str,
        preferred_time: str = "Evening"
    ) -> List[PlannerActivity]:
        """
        Generates a list of PlannerActivity objects for a single day.
        Assigns time slots sequentially from the preferred start hour,
        choosing weak topics first for each subject.
        """
        activities = []
        start_hour = self._get_start_hour(preferred_time)
        current_minutes = start_hour * 60  # Total minutes from midnight
        sort_idx = 0

        for subj in scored_subjects:
            alloc = subj.get("allocated_minutes", 60)
            if alloc <= 0:
                continue

            # Choose topic: prioritize weak topics or selected_topic
            topic = subj.get("selected_topic")
            if not topic:
                weak = subj.get("weak_topics", [])
                strong = subj.get("strong_topics", [])
                topic_pool = weak + strong if weak else (strong if strong else ["General Study"])
                topic = topic_pool[0] if topic_pool else "General Study"

            # Build time strings
            start_h, start_m = divmod(current_minutes, 60)
            end_minutes = current_minutes + alloc
            end_h, end_m = divmod(end_minutes, 60)

            # Cap at 23:59
            if end_h >= 24:
                end_h, end_m = 23, 59

            start_str = f"{start_h:02d}:{start_m:02d}"
            end_str = f"{end_h:02d}:{end_m:02d}"

            activity = PlannerActivity(
                user_id=user_id,
                calendar_date=target_date,
                subject=subj["name"],
                topic=topic,
                start_time=start_str,
                end_time=end_str,
                planned_duration_min=alloc,
                actual_duration_min=0,
                priority=subj["priority_label"],
                status="pending",
                is_confirmed=False,
                sort_order=sort_idx
            )
            activities.append(activity)
            sort_idx += 1

            # Add 5-minute break between sessions
            current_minutes = end_minutes + 5

            # If subject has both weak and strong topics and time allows,
            # add a revision block for 30% of allocated time
            weak = subj.get("weak_topics", [])
            strong = subj.get("strong_topics", [])
            if weak and strong and alloc >= 45:
                revision_min = max(15, round(alloc * 0.3))
                rev_start_h, rev_start_m = divmod(current_minutes, 60)
                rev_end = current_minutes + revision_min
                rev_end_h, rev_end_m = divmod(rev_end, 60)
                if rev_end_h < 24:
                    revision_activity = PlannerActivity(
                        user_id=user_id,
                        calendar_date=target_date,
                        subject=subj["name"],
                        topic=f"{strong[0]} (Revision)",
                        start_time=f"{rev_start_h:02d}:{rev_start_m:02d}",
                        end_time=f"{rev_end_h:02d}:{rev_end_m:02d}",
                        planned_duration_min=revision_min,
                        actual_duration_min=0,
                        priority="Low",
                        status="pending",
                        is_confirmed=False,
                        sort_order=sort_idx
                    )
                    activities.append(revision_activity)
                    sort_idx += 1
                    current_minutes = rev_end + 5

        return activities

    async def generate_plan(
        self,
        user_id: uuid.UUID,
        profile: PlannerProfile,
        scope: str = "today",
        force: bool = False
    ) -> List[PlannerActivity]:
        """
        Generates a personalized study plan for today, 7-day week, or 30-day month.
        Rotates syllabus topics across days with dedicated focus time per day.
        """
        subjects = profile.subjects or []
        if not subjects:
            return []

        daily_minutes = max(30, int((profile.daily_hours or 2.0) * 60))
        scored = self.calculate_priority_scores(subjects)

        today_str = date.today().strftime("%Y-%m-%d")
        all_activities = []

        if scope == "today":
            dates = [today_str]
        elif scope in ["month", "30day", "30days", "30-day"]:
            dates = [(date.today() + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(30)]
        else: # "week", "7day", "7-day"
            dates = [(date.today() + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]

        # Delete existing unconfirmed activities for these dates
        for d in dates:
            existing = await self.db.execute(
                select(PlannerActivity).filter(
                    PlannerActivity.user_id == user_id,
                    PlannerActivity.calendar_date == d,
                    PlannerActivity.is_confirmed == False
                )
            )
            for act in existing.scalars().all():
                await self.db.delete(act)

        await self.db.flush()

        start_hour = self._get_start_hour(profile.preferred_study_time)

        # Generate activities per day
        for day_idx, d in enumerate(dates):
            current_minutes = start_hour * 60
            sort_idx = 0

            if len(scored) == 1 or scope == "today":
                # Distribute daily minutes proportionally across subjects
                day_scored = self.distribute_time(scored, daily_minutes)
                day_acts = self.generate_daily_activities(
                    user_id=user_id,
                    scored_subjects=day_scored,
                    target_date=d,
                    preferred_time=profile.preferred_study_time
                )
                for act in day_acts:
                    self.db.add(act)
                    all_activities.append(act)
            else:
                # Multi-day curriculum plan: Allocate dedicated topic(s) per day with full study time
                primary_subj = dict(scored[day_idx % len(scored)])
                subj_name = primary_subj.get("name", "Core Curriculum")
                
                weak = primary_subj.get("weak_topics", [])
                if isinstance(weak, str):
                    weak = [w.strip() for w in weak.split(",") if w.strip()]
                strong = primary_subj.get("strong_topics", [])
                if isinstance(strong, str):
                    strong = [st.strip() for st in strong.split(",") if st.strip()]

                all_t = weak + strong if (weak or strong) else []
                topic_focus = all_t[0] if all_t else f"{subj_name} Core Concepts"

                # Session 1: Deep Dive Mastery (70% of available daily time)
                s1_dur = max(25, int(daily_minutes * 0.70))
                s1_start_h, s1_start_m = divmod(current_minutes, 60)
                cur_end = current_minutes + s1_dur
                s1_end_h, s1_end_m = divmod(min(cur_end, 23 * 60 + 59), 60)

                act1 = PlannerActivity(
                    user_id=user_id,
                    calendar_date=d,
                    subject=subj_name,
                    topic=topic_focus,
                    start_time=f"{s1_start_h:02d}:{s1_start_m:02d}",
                    end_time=f"{s1_end_h:02d}:{s1_end_m:02d}",
                    planned_duration_min=s1_dur,
                    actual_duration_min=0,
                    priority=primary_subj.get("priority_label", "High"),
                    status="pending",
                    is_confirmed=False,
                    sort_order=sort_idx
                )
                self.db.add(act1)
                all_activities.append(act1)
                sort_idx += 1

                # Session 2: Active Recall / Practice Problem Set (30% of daily time)
                s2_dur = max(15, daily_minutes - s1_dur)
                cur_min_s2 = cur_end + 10 # 10m break
                if cur_min_s2 < 23 * 60 + 40:
                    s2_start_h, s2_start_m = divmod(cur_min_s2, 60)
                    s2_end = cur_min_s2 + s2_dur
                    s2_end_h, s2_end_m = divmod(min(s2_end, 23 * 60 + 59), 60)

                    rev_topic = (all_t[1] if len(all_t) > 1 else topic_focus) + " (Practice & Quiz)"
                    act2 = PlannerActivity(
                        user_id=user_id,
                        calendar_date=d,
                        subject=subj_name,
                        topic=rev_topic,
                        start_time=f"{s2_start_h:02d}:{s2_start_m:02d}",
                        end_time=f"{s2_end_h:02d}:{s2_end_m:02d}",
                        planned_duration_min=s2_dur,
                        actual_duration_min=0,
                        priority="Medium",
                        status="pending",
                        is_confirmed=False,
                        sort_order=sort_idx
                    )
                    self.db.add(act2)
                    all_activities.append(act2)

        await self.db.flush()
        return all_activities

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Confirm Plan ("Set This Plan")
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def confirm_plan(self, user_id: uuid.UUID) -> int:
        """Marks all pending unconfirmed activities as confirmed (sets them on the calendar)."""
        result = await self.db.execute(
            select(PlannerActivity).filter(
                PlannerActivity.user_id == user_id,
                PlannerActivity.is_confirmed == False,
                PlannerActivity.status == "pending"
            )
        )
        activities = result.scalars().all()
        for act in activities:
            act.is_confirmed = True
        await self.db.flush()
        return len(activities)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Activity CRUD & Updates
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_activities(
        self, user_id: uuid.UUID, date_from: Optional[str] = None, date_to: Optional[str] = None
    ) -> List[PlannerActivity]:
        """Fetches activities for the user, optionally filtered by date range."""
        stmt = select(PlannerActivity).filter(PlannerActivity.user_id == user_id)
        if date_from:
            stmt = stmt.filter(PlannerActivity.calendar_date >= date_from)
        if date_to:
            stmt = stmt.filter(PlannerActivity.calendar_date <= date_to)
        stmt = stmt.order_by(PlannerActivity.calendar_date, PlannerActivity.sort_order)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_activity(
        self, user_id: uuid.UUID, activity_id: uuid.UUID, updates: dict
    ) -> Optional[PlannerActivity]:
        """Updates an activity (mark complete, reschedule, etc.)."""
        result = await self.db.execute(
            select(PlannerActivity).filter(
                PlannerActivity.id == activity_id,
                PlannerActivity.user_id == user_id
            )
        )
        activity = result.scalars().first()
        if not activity:
            return None

        old_status = activity.status

        for key, val in updates.items():
            if val is not None and hasattr(activity, key):
                setattr(activity, key, val)

        # Handle missed → reschedule to next day
        if updates.get("status") == "missed" and old_status != "missed":
            await self._reschedule_missed(user_id, activity)

        # Update streak on completion
        if updates.get("status") == "completed" and old_status != "completed":
            await self._update_streak_on_completion(user_id, activity.actual_duration_min or activity.planned_duration_min)

        await self.db.flush()
        return activity

    async def _reschedule_missed(self, user_id: uuid.UUID, missed_activity: PlannerActivity):
        """Creates a new activity for the next day when a task is missed, with boosted priority."""
        try:
            old_date = datetime.strptime(missed_activity.calendar_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return
        new_date = (old_date + timedelta(days=1)).strftime("%Y-%m-%d")

        # Boost priority for rescheduled tasks
        priority_boost = {"Low": "Medium", "Medium": "High", "High": "High"}
        new_priority = priority_boost.get(missed_activity.priority, "High")

        new_activity = PlannerActivity(
            user_id=user_id,
            calendar_date=new_date,
            subject=missed_activity.subject,
            topic=missed_activity.topic,
            start_time=missed_activity.start_time,
            end_time=missed_activity.end_time,
            planned_duration_min=missed_activity.planned_duration_min,
            actual_duration_min=0,
            priority=new_priority,
            status="pending",
            is_confirmed=True,
            sort_order=0
        )
        self.db.add(new_activity)

    async def delete_activity(self, user_id: uuid.UUID, activity_id: uuid.UUID) -> bool:
        """Deletes an activity."""
        result = await self.db.execute(
            select(PlannerActivity).filter(
                PlannerActivity.id == activity_id,
                PlannerActivity.user_id == user_id
            )
        )
        activity = result.scalars().first()
        if activity:
            await self.db.delete(activity)
            await self.db.flush()
            return True
        return False

    async def add_custom_activity(self, user_id: uuid.UUID, data: dict) -> PlannerActivity:
        """Adds a manually created activity to the calendar."""
        activity = PlannerActivity(
            user_id=user_id,
            calendar_date=data["calendar_date"],
            subject=data["subject"],
            topic=data["topic"],
            start_time=data["start_time"],
            end_time=data["end_time"],
            planned_duration_min=data.get("planned_duration_min", 60),
            priority=data.get("priority", "Medium"),
            status="pending",
            is_confirmed=True,
            sort_order=99
        )
        self.db.add(activity)
        await self.db.flush()
        return activity

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Pomodoro & Streak
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def record_pomodoro(
        self, user_id: uuid.UUID, subject: str, duration_minutes: int, activity_id: Optional[uuid.UUID] = None
    ) -> dict:
        """Records a completed Pomodoro session, updates streak and activity time."""
        # Update activity if linked
        if activity_id:
            result = await self.db.execute(
                select(PlannerActivity).filter(
                    PlannerActivity.id == activity_id,
                    PlannerActivity.user_id == user_id
                )
            )
            activity = result.scalars().first()
            if activity:
                activity.actual_duration_min += duration_minutes

        # Update streak
        await self._update_streak_on_completion(user_id, duration_minutes, pomodoro=True)

        return {"status": "recorded", "subject": subject, "duration": duration_minutes}

    async def _update_streak_on_completion(self, user_id: uuid.UUID, minutes: int, pomodoro: bool = False):
        """Updates learning streak when a study session is completed."""
        result = await self.db.execute(
            select(PlannerStreak).filter(PlannerStreak.user_id == user_id)
        )
        streak = result.scalars().first()

        today_str = date.today().strftime("%Y-%m-%d")

        if not streak:
            streak = PlannerStreak(
                user_id=user_id,
                current_streak=1,
                longest_streak=1,
                last_active_date=today_str,
                total_study_minutes=minutes,
                total_pomodoro_sessions=1 if pomodoro else 0
            )
            self.db.add(streak)
            await self.db.flush()
            return

        streak.total_study_minutes += minutes
        if pomodoro:
            streak.total_pomodoro_sessions += 1

        if streak.last_active_date == today_str:
            # Already active today, no streak change
            return

        # Check if yesterday was the last active date
        yesterday_str = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
        if streak.last_active_date == yesterday_str:
            streak.current_streak += 1
        else:
            streak.current_streak = 1

        if streak.current_streak > streak.longest_streak:
            streak.longest_streak = streak.current_streak

        streak.last_active_date = today_str
        await self.db.flush()

    async def get_streak(self, user_id: uuid.UUID) -> dict:
        """Returns current streak data."""
        result = await self.db.execute(
            select(PlannerStreak).filter(PlannerStreak.user_id == user_id)
        )
        streak = result.scalars().first()
        if not streak:
            return {
                "current_streak": 0, "longest_streak": 0,
                "last_active_date": None, "total_study_minutes": 0,
                "total_pomodoro_sessions": 0
            }

        # Check if streak is still alive (last active must be today or yesterday)
        today_str = date.today().strftime("%Y-%m-%d")
        yesterday_str = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
        if streak.last_active_date not in (today_str, yesterday_str):
            streak.current_streak = 0
            await self.db.flush()

        return {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "last_active_date": streak.last_active_date,
            "total_study_minutes": streak.total_study_minutes,
            "total_pomodoro_sessions": streak.total_pomodoro_sessions
        }

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Productivity Analytics
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_analytics(self, user_id: uuid.UUID) -> dict:
        """Computes comprehensive productivity analytics from confirmed activities."""
        result = await self.db.execute(
            select(PlannerActivity).filter(
                PlannerActivity.user_id == user_id,
                PlannerActivity.is_confirmed == True
            )
        )
        activities = list(result.scalars().all())

        if not activities:
            return {
                "total_planned_hours": 0, "total_actual_hours": 0,
                "completed_tasks": 0, "missed_tasks": 0, "pending_tasks": 0,
                "completion_percentage": 0, "most_studied_subject": None,
                "weakest_subject": None, "productivity_score": 0,
                "weekly_progress": []
            }

        total_planned = sum(a.planned_duration_min for a in activities)
        total_actual = sum(a.actual_duration_min for a in activities)
        completed = sum(1 for a in activities if a.status == "completed")
        missed = sum(1 for a in activities if a.status == "missed")
        pending = sum(1 for a in activities if a.status == "pending")
        total_tasks = len(activities)

        completion_pct = round((completed / total_tasks) * 100, 1) if total_tasks > 0 else 0

        # Subject analysis
        subject_actual = {}
        subject_planned = {}
        for a in activities:
            subject_actual[a.subject] = subject_actual.get(a.subject, 0) + a.actual_duration_min
            subject_planned[a.subject] = subject_planned.get(a.subject, 0) + a.planned_duration_min

        most_studied = max(subject_actual, key=subject_actual.get) if subject_actual else None
        # Weakest = least actual time relative to planned
        weakest = None
        if subject_planned:
            ratios = {s: (subject_actual.get(s, 0) / p if p > 0 else 0) for s, p in subject_planned.items()}
            weakest = min(ratios, key=ratios.get)

        # Productivity score: weighted combination of completion rate and time efficiency
        time_efficiency = min(100, round((total_actual / total_planned) * 100, 1)) if total_planned > 0 else 0
        productivity_score = round(completion_pct * 0.6 + time_efficiency * 0.4, 1)

        # Weekly progress (last 7 days)
        weekly = []
        for i in range(6, -1, -1):
            d = (date.today() - timedelta(days=i)).strftime("%Y-%m-%d")
            day_planned = sum(a.planned_duration_min for a in activities if a.calendar_date == d)
            day_actual = sum(a.actual_duration_min for a in activities if a.calendar_date == d)
            weekly.append({"day": d, "planned_min": day_planned, "actual_min": day_actual})

        return {
            "total_planned_hours": round(total_planned / 60, 1),
            "total_actual_hours": round(total_actual / 60, 1),
            "completed_tasks": completed,
            "missed_tasks": missed,
            "pending_tasks": pending,
            "completion_percentage": completion_pct,
            "most_studied_subject": most_studied,
            "weakest_subject": weakest,
            "productivity_score": productivity_score,
            "weekly_progress": weekly
        }

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # AI Recommendations
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def get_recommendations(self, user_id: uuid.UUID) -> List[str]:
        """
        Generates AI-powered study recommendations based on student performance.
        Uses Gemini API when available, with a comprehensive rule-based fallback.
        """
        # Get profile
        res = await self.db.execute(
            select(PlannerProfile).filter(PlannerProfile.user_id == user_id)
        )
        profile = res.scalars().first()
        if not profile or not profile.subjects:
            return ["Set up your study profile to get personalized AI recommendations."]

        # Get analytics for context
        analytics = await self.get_analytics(user_id)
        scored = self.calculate_priority_scores(profile.subjects)

        # Try Gemini
        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY
        if not is_mock_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                model = genai.GenerativeModel(settings.GEMINI_MODEL)

                subjects_summary = "\n".join([
                    f"- {s['name']}: {s.get('marks', 0)}% marks, "
                    f"weak topics: {', '.join(s.get('weak_topics', []))}, "
                    f"exam in {s.get('days_remaining', 'N/A')} days, "
                    f"priority: {s.get('priority_label', 'Medium')}"
                    for s in scored
                ])

                prompt = (
                    f"You are an expert AI study coach. Based on the following student data, "
                    f"provide 3-5 brief, actionable study recommendations. "
                    f"Each should be 1-2 sentences maximum.\n\n"
                    f"Subjects:\n{subjects_summary}\n\n"
                    f"Analytics: Completion rate {analytics['completion_percentage']}%, "
                    f"Productivity score {analytics['productivity_score']}/100, "
                    f"Most studied: {analytics['most_studied_subject']}, "
                    f"Weakest: {analytics['weakest_subject']}\n\n"
                    f"Return ONLY a JSON array of recommendation strings. No markdown."
                )

                response = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, prompt),
                    timeout=2.5
                )
                raw = response.text.replace("```json", "").replace("```", "").strip()
                recs = json.loads(raw)
                if isinstance(recs, list) and len(recs) > 0:
                    return recs[:5]
            except Exception as e:
                print(f"Gemini recommendation fallback: {e}")

        # Rule-based fallback recommendations
        return self._generate_fallback_recommendations(scored, analytics)

    def _generate_fallback_recommendations(self, scored_subjects: List[dict], analytics: dict) -> List[str]:
        """Generates rule-based recommendations when AI is unavailable."""
        recommendations = []

        for subj in scored_subjects:
            marks = float(subj.get("marks", 50))
            name = subj.get("name", "Subject")
            weak = subj.get("weak_topics", [])
            days = subj.get("days_remaining")

            # Low performance alert
            if marks < 60:
                rec = f"Your {name} performance is at {marks}%. "
                if weak:
                    rec += f"Focus on weak topics: {', '.join(weak[:2])}. "
                rec += "Spend 30 additional minutes on practice today."
                recommendations.append(rec)

            # Exam deadline urgency
            if days is not None and 0 < days <= 3:
                recommendations.append(
                    f"⚠️ {name} exam is in {days} day(s)! "
                    f"Prioritize revision and practice problems today."
                )
            elif days is not None and 3 < days <= 7:
                recommendations.append(
                    f"{name} exam is in {days} days. "
                    f"Increase study intensity this week."
                )

            # High performance — can reduce
            if marks >= 85 and len(recommendations) > 0:
                recommendations.append(
                    f"You've completed {marks}% in {name}. "
                    f"You can reduce {name} study time and redirect to weaker subjects."
                )

        # Analytics-based recommendations
        if analytics.get("completion_percentage", 0) < 50:
            recommendations.append(
                "Your task completion rate is below 50%. "
                "Try breaking tasks into smaller 25-minute Pomodoro sessions for better consistency."
            )

        if analytics.get("missed_tasks", 0) > analytics.get("completed_tasks", 0):
            recommendations.append(
                "You're missing more tasks than completing. "
                "Consider reducing daily study hours to a realistic target."
            )

        if not recommendations:
            recommendations.append(
                "You're on track! Keep maintaining your study schedule consistently."
            )

        return recommendations[:5]

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Goal Management
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def create_goal(self, user_id: uuid.UUID, data: dict) -> PlannerGoal:
        goal = PlannerGoal(
            user_id=user_id,
            name=data["name"],
            target_date=data.get("target_date"),
            total_tasks=data.get("total_tasks", 0),
            completed_tasks=0,
            progress=0.0,
            status="active"
        )
        self.db.add(goal)
        await self.db.flush()
        return goal

    async def get_goals(self, user_id: uuid.UUID) -> List[PlannerGoal]:
        result = await self.db.execute(
            select(PlannerGoal).filter(PlannerGoal.user_id == user_id).order_by(PlannerGoal.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID, data: dict) -> Optional[PlannerGoal]:
        result = await self.db.execute(
            select(PlannerGoal).filter(PlannerGoal.id == goal_id, PlannerGoal.user_id == user_id)
        )
        goal = result.scalars().first()
        if not goal:
            return None

        if data.get("completed_tasks") is not None:
            goal.completed_tasks = data["completed_tasks"]
        if data.get("total_tasks") is not None:
            goal.total_tasks = data["total_tasks"]
        if data.get("status") is not None:
            goal.status = data["status"]

        # Recalculate progress
        if goal.total_tasks > 0:
            goal.progress = round((goal.completed_tasks / goal.total_tasks) * 100, 1)
            if goal.progress >= 100:
                goal.status = "completed"
                goal.progress = 100.0
        else:
            goal.progress = 0.0

        await self.db.flush()
        return goal

    async def delete_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(PlannerGoal).filter(PlannerGoal.id == goal_id, PlannerGoal.user_id == user_id)
        )
        goal = result.scalars().first()
        if goal:
            await self.db.delete(goal)
            await self.db.flush()
            return True
        return False
