import pytest

from app.pdf_utils import NoTextLayerError, assert_text_layer


def test_empty_pages_raise():
    with pytest.raises(NoTextLayerError):
        assert_text_layer(["", "", ""])


def test_text_pdf_passes():
    assert_text_layer(["a" * 1000, "b" * 1000, "c" * 1000])


def test_mostly_empty_pages_raise_even_with_enough_total_text():
    with pytest.raises(NoTextLayerError):
        assert_text_layer(["", "", "", "a" * 2000])
