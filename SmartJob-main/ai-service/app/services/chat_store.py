from datetime import datetime, timedelta, timezone

from pymongo import ASCENDING, MongoClient
from pymongo.errors import PyMongoError

from app.settings import settings

_collection = None


def _collection_handle():
    global _collection
    if _collection is not None:
        return _collection
    if not settings.mongodb_uri:
        return None
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=3000)
    collection = client[settings.ai_db]["ai_messages"]
    collection.create_index([("userId", ASCENDING), ("createdAt", ASCENDING)])
    _collection = collection
    return collection


def recent_turns(user_id: str, limit: int = 10) -> list[dict]:
    try:
        collection = _collection_handle()
        if collection is None:
            return []
        docs = list(
            collection.find({"userId": user_id}, {"_id": 0, "role": 1, "content": 1})
            .sort("createdAt", -1)
            .limit(limit)
        )
    except PyMongoError as error:
        print(f"chat history read failed: {error}")
        return []
    docs.reverse()
    return [{"role": doc.get("role", "user"), "content": doc.get("content", "")} for doc in docs]


def append_turn(user_id: str, question: str, answer: str) -> None:
    try:
        collection = _collection_handle()
        if collection is None:
            return
        now = datetime.now(timezone.utc)
        collection.insert_many(
            [
                {
                    "userId": user_id,
                    "role": "user",
                    "content": question[:2000],
                    "createdAt": now,
                },
                {
                    "userId": user_id,
                    "role": "assistant",
                    "content": (answer or "")[:2000],
                    "createdAt": now + timedelta(milliseconds=1),
                },
            ]
        )
    except PyMongoError as error:
        print(f"chat history write failed: {error}")
