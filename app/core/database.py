from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Create asynchronous engine.
# echo=True prints SQL statements to standard out (useful for debugging, disable in production)
_engine_kwargs = {
    "echo": settings.ENV == "development",
    "future": True,
}
# pool_size / max_overflow are only valid for pool-based backends (e.g. PostgreSQL).
# SQLite uses NullPool and rejects these arguments.
if "sqlite" not in settings.ASYNC_DATABASE_URL:
    _engine_kwargs["pool_size"] = 20
    _engine_kwargs["max_overflow"] = 10
else:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(settings.ASYNC_DATABASE_URL, **_engine_kwargs)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


# Declarative base class for models
class Base(DeclarativeBase):
    pass


# Dependency injector to get database session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
