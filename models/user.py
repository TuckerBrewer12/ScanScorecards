from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from typing import Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .round import Round


class User(BaseModel):
    """Represents a golfer with their rounds and handicap."""
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    home_course_id: Optional[str] = None
    handicap_index: Optional[float] = Field(None, ge=-10, le=54)
    rounds: List[Round] = Field(default_factory=list)
    created_at: Optional[datetime] = None

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']
