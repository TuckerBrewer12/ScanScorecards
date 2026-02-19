"""Load player JSON data (courses + rounds) into the database.
    pip install -r requirements.txt  
    python3 data/load_player_data.py data/scheffler_courses.json data/scheffler_rounds.json "Scottie Scheffler" "scheffler@example.com"
"""

import asyncio
import json
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Course, HoleScore, Round, User
from database.connection import DatabasePool

# User has a forward reference to Round — resolve it
User.model_rebuild()


async def load_data(
    courses_path: str,
    rounds_path: str,
    player_name: str,
    player_email: str,
    dsn: str = None,
):
    # Read JSON files
    with open(courses_path) as f:
        courses_data = json.load(f)
    with open(rounds_path) as f:
        rounds_data = json.load(f)

    print(f"Loaded {len(courses_data)} courses, {len(rounds_data)} rounds from JSON")

    # Connect to database
    pool = DatabasePool()
    await pool.initialize(dsn=dsn)

    from database.db_manager import DatabaseManager
    db = DatabaseManager(pool.pool)

    try:
        # 1. Create or find user
        user = await db.users.get_user_by_email(player_email)
        if user:
            print(f"Found existing user: {user.name} ({user.id})")
        else:
            user = await db.users.create_user(User(name=player_name, email=player_email))
            print(f"Created user: {user.name} ({user.id})")

        # 2. Load courses (skip duplicates)
        course_map = {}  # name -> Course (with DB-generated id)
        for c_data in courses_data:
            name = c_data["name"]
            existing = await db.courses.find_course_by_name(name)
            if existing:
                print(f"  Course exists: {name} ({existing.id})")
                course_map[name] = existing
            else:
                course = await db.courses.create_course(Course(**c_data))
                print(f"  Created course: {name} ({course.id})")
                course_map[name] = course

        print(f"\n{len(course_map)} courses ready")

        # 3. Load rounds (skip duplicates by user + course + date)
        existing_rounds = await db.rounds.get_rounds_for_user(user.id, limit=9999)
        existing_keys = {
            (r.course.id if r.course else None, r.date.strftime("%Y-%m-%d") if r.date else None)
            for r in existing_rounds
        }

        created = 0
        skipped = 0
        for r_data in rounds_data:
            course_name = r_data["course_name"]
            course = course_map.get(course_name)
            if not course:
                print(f"  SKIP: no course found for '{course_name}'")
                skipped += 1
                continue

            # Duplicate check: same course + date
            if (course.id, r_data["date"]) in existing_keys:
                print(f"  EXISTS: {r_data.get('tournament', '?')} {r_data['date']} — skipping")
                skipped += 1
                continue

            round_ = Round(
                course=course,
                tee_box=r_data.get("tee_box"),
                date=r_data["date"],
                hole_scores=[HoleScore(**hs) for hs in r_data["hole_scores"]],
                notes=r_data.get("tournament"),
            )

            await db.rounds.create_round(round_, user.id, course_id=course.id)
            total = round_.calculate_total_score()
            created += 1
            print(f"  R{created}: {r_data.get('tournament', '?')} {r_data['date']} — {total}")

        print(f"\nDone: {created} rounds created, {skipped} skipped")

    finally:
        await pool.close()


def main():
    if len(sys.argv) < 5:
        print("Usage: python data/load_player_data.py <courses.json> <rounds.json> <name> <email>")
        print('Example: python data/load_player_data.py data/scheffler_courses.json data/scheffler_rounds.json "Scottie Scheffler" "scheffler@example.com"')
        sys.exit(1)

    courses_path = sys.argv[1]
    rounds_path = sys.argv[2]
    player_name = sys.argv[3]
    player_email = sys.argv[4]

    dsn = os.environ.get("DATABASE_URL")

    asyncio.run(load_data(courses_path, rounds_path, player_name, player_email, dsn))


if __name__ == "__main__":
    main()