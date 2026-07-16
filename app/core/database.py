from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Create asynchronous engine.
# echo=True prints SQL statements to standard out (useful for debugging, disable in production)
engine = create_async_engine(
    settings.ASYNC_DATABASE_URL,
    echo=settings.ENV == "development",
    future=True,
    pool_size=20,
    max_overflow=10
)

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
