import pytest
from pydantic import ValidationError

from api.auth_schemas import RegisterRequest
from api.routers.users import UpdateUserRequest
from models import User


def test_user_model_handicap_supports_plus_handicap_range():
    assert User(handicap=5.1).handicap == 5.1
    assert User(handicap=0).handicap == 0
    assert User(handicap=-2.5).handicap == -2.5
    with pytest.raises(ValidationError):
        User(handicap=-10.1)
    with pytest.raises(ValidationError):
        User(handicap=54.1)


def test_register_schema_accepts_plus_prefixed_handicap():
    req = RegisterRequest(
        name="Test User",
        email="test@example.com",
        password="Password123!",
        handicap="+5.2",
    )
    assert req.handicap == -5.2


def test_register_schema_rejects_out_of_range_handicap():
    with pytest.raises(ValidationError):
        RegisterRequest(
            name="Test User",
            email="test@example.com",
            password="Password123!",
            handicap=-11,
        )
    with pytest.raises(ValidationError):
        RegisterRequest(
            name="Test User",
            email="test@example.com",
            password="Password123!",
            handicap=54.5,
        )


def test_update_user_schema_accepts_plus_notation_and_range():
    assert UpdateUserRequest(handicap="+3").handicap == -3
    assert UpdateUserRequest(handicap=0).handicap == 0
    assert UpdateUserRequest(handicap=6.8).handicap == 6.8

    with pytest.raises(ValidationError):
        UpdateUserRequest(handicap=-10.5)
    with pytest.raises(ValidationError):
        UpdateUserRequest(handicap=55)
