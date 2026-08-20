import asyncio
import httpx

async def test_planner_flow():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Register a test user
        email = f"planner_user_{asyncio.get_event_loop().time()}@example.com"
        reg_resp = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": "Password123!",
            "first_name": "Study",
            "last_name": "Planner"
        })
        print(f"Register status: {reg_resp.status_code}")
        
        # 2. Login
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": email,
            "password": "Password123!",
            "device_id": "test_device_1"
        })
        print(f"Login status: {login_resp.status_code}")
        data = login_resp.json()
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 3. Save profile
        profile_payload = {
            "daily_hours": 4.0,
            "preferred_study_time": "Evening",
            "study_goal": "Semester exam prep",
            "subjects": [
                {
                    "name": "DSA",
                    "marks": 55.0,
                    "weak_topics": ["Dynamic Programming", "Graph Theory"],
                    "strong_topics": ["Arrays", "Linked Lists"],
                    "exam_date": "2026-08-25",
                    "priority": 8
                },
                {
                    "name": "Python",
                    "marks": 80.0,
                    "weak_topics": ["Decorators"],
                    "strong_topics": ["OOP", "Data Structures"],
                    "exam_date": "2026-09-01",
                    "priority": 5
                },
                {
                    "name": "Machine Learning",
                    "marks": 65.0,
                    "weak_topics": ["Neural Networks"],
                    "strong_topics": ["Linear Regression"],
                    "exam_date": "2026-08-30",
                    "priority": 6
                }
            ]
        }
        prof_resp = await client.post("/api/v1/planner/profile", json=profile_payload, headers=headers)
        print(f"Save profile status: {prof_resp.status_code}")
        
        # 4. Generate plan
        gen_resp = await client.post("/api/v1/planner/generate", json={
            "plan_scope": "today",
            "force_regenerate": True
        }, headers=headers)
        print(f"Generate plan status: {gen_resp.status_code}")
        activities = gen_resp.json()
        print(f"Generated activities count: {len(activities)}")
        for act in activities:
            print(f"  - {act['start_time']} - {act['end_time']}: {act['subject']} ({act['topic']}) [{act['priority']}] - {act['planned_duration_min']}m")
            
        # 5. Set plan
        set_resp = await client.post("/api/v1/planner/set-plan", headers=headers)
        print(f"Set plan status: {set_resp.status_code}, response: {set_resp.json()}")
        
        # 6. Complete an activity
        if activities:
            act_id = activities[0]["id"]
            up_resp = await client.put(f"/api/v1/planner/activities/{act_id}", json={
                "status": "completed",
                "actual_duration_min": activities[0]["planned_duration_min"]
            }, headers=headers)
            print(f"Complete activity status: {up_resp.status_code}")
            
        # 7. Pomodoro complete
        pomo_resp = await client.post("/api/v1/planner/pomodoro/complete", json={
            "subject": "DSA",
            "duration_minutes": 25
        }, headers=headers)
        print(f"Pomodoro complete status: {pomo_resp.status_code}")
        
        # 8. Create goal
        goal_resp = await client.post("/api/v1/planner/goals", json={
            "name": "Finish DSA Revision",
            "target_date": "2026-08-25",
            "total_tasks": 10
        }, headers=headers)
        print(f"Create goal status: {goal_resp.status_code}")
        
        # 9. Get streak
        streak_resp = await client.get("/api/v1/planner/streak", headers=headers)
        print(f"Streak: {streak_resp.json()}")
        
        # 10. Get analytics
        ana_resp = await client.get("/api/v1/planner/analytics", headers=headers)
        print(f"Analytics: {ana_resp.json()}")
        
        # 11. Get recommendations
        rec_resp = await client.get("/api/v1/planner/recommendations", headers=headers)
        print(f"Recommendations: {rec_resp.json()}")

if __name__ == "__main__":
    asyncio.run(test_planner_flow())
