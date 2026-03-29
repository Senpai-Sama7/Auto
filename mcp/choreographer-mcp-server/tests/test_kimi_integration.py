"""Integration tests for Kimi API integration."""

import asyncio
import os
import pytest
from unittest.mock import patch, MagicMock

from choreographer.workers.kimi_client import KimiClient, KimiError


class TestKimiClient:
    """Test Kimi client functionality."""
    
    @pytest.fixture
    def mock_api_key(self):
        """Provide a mock API key."""
        return "test-api-key-12345"
    
    def test_client_initialization(self, mock_api_key):
        """Test Kimi client initializes correctly."""
        client = KimiClient(api_key=mock_api_key)
        assert client.api_key == mock_api_key
        assert client.timeout == 60.0
        client.close()
    
    def test_client_initialization_from_env(self, monkeypatch):
        """Test Kimi client reads API key from environment."""
        monkeypatch.setenv("KIMI_API_KEY", "env-api-key")
        client = KimiClient()
        assert client.api_key == "env-api-key"
        client.close()
    
    def test_client_initialization_no_key(self, monkeypatch):
        """Test Kimi client raises error without API key."""
        monkeypatch.delenv("KIMI_API_KEY", raising=False)
        with pytest.raises(KimiError, match="Kimi API key not provided"):
            KimiClient()
    
    def test_extract_code_from_markdown(self, mock_api_key):
        """Test code extraction from markdown response."""
        client = KimiClient(api_key=mock_api_key)
        
        # Test with markdown code block
        markdown = '''Here's the code:
```python
def hello():
    return "world"
```
Some explanation.'''
        
        extracted = client._extract_code(markdown)
        assert "def hello():" in extracted
        assert "return \"world\"" in extracted
        assert "```" not in extracted
        
        client.close()
    
    def test_extract_code_plain(self, mock_api_key):
        """Test code extraction from plain text."""
        client = KimiClient(api_key=mock_api_key)
        
        plain = "def hello():\n    return 'world'"
        extracted = client._extract_code(plain)
        assert extracted == plain
        
        client.close()
    
    def test_validate_code_syntax(self, mock_api_key):
        """Test code validation for valid syntax."""
        client = KimiClient(api_key=mock_api_key)
        
        valid_code = "def hello():\n    return 'world'"
        result = client.validate_code(valid_code)
        
        assert result["syntax_valid"] is True
        assert result["can_compile"] is True
        assert result["errors"] == []
        
        client.close()
    
    def test_validate_code_invalid_syntax(self, mock_api_key):
        """Test code validation for invalid syntax."""
        client = KimiClient(api_key=mock_api_key)
        
        invalid_code = "def hello(\n    return 'world'"  # Missing closing paren
        result = client.validate_code(invalid_code)
        
        assert result["syntax_valid"] is False
        assert result["can_compile"] is False
        assert len(result["errors"]) > 0
        
        client.close()
    
    @patch('choreographer.workers.kimi_client.httpx.Client.post')
    def test_generate_code_success(self, mock_post, mock_api_key):
        """Test successful code generation."""
        # Mock response
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "choices": [{
                "message": {
                    "content": "```python\ndef celsius_to_fahrenheit(c):\n    return (c * 9/5) + 32\n```"
                }
            }],
            "model": "kimi-latest",
            "usage": {"prompt_tokens": 50, "completion_tokens": 20}
        }
        mock_post.return_value = mock_response
        
        client = KimiClient(api_key=mock_api_key)
        result = client.generate_code(
            specification="Convert Celsius to Fahrenheit",
            language="python"
        )
        
        assert result["success"] is True
        assert "celsius_to_fahrenheit" in result["generated_code"]
        assert result["model"] == "kimi-latest"
        assert "usage" in result
        
        client.close()
    
    @patch('choreographer.workers.kimi_client.httpx.Client.post')
    def test_generate_code_api_error(self, mock_post, mock_api_key):
        """Test code generation with API error."""
        from httpx import HTTPError
        
        mock_post.side_effect = HTTPError("Connection failed")
        
        client = KimiClient(api_key=mock_api_key)
        
        with pytest.raises(KimiError, match="Kimi API request failed"):
            client.generate_code(specification="Test")
        
        client.close()
    
    def test_context_manager(self, mock_api_key):
        """Test Kimi client as context manager."""
        with KimiClient(api_key=mock_api_key) as client:
            assert client.api_key == mock_api_key
        # After exiting context, client should be closed


class TestWorkerKimiIntegration:
    """Test worker integration with Kimi."""
    
    @pytest.mark.asyncio
    @patch('choreographer.workers.worker._worker_credentials', {"kimi_key": "test-key"})
    @patch('choreographer.workers.kimi_client.KimiClient')
    async def test_task_generate_code(self, mock_client_class):
        """Test generate_code action in worker."""
        from choreographer.workers.worker import run_agent_task
        
        # Mock Kimi client
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=None)
        mock_client.generate_code.return_value = {
            "generated_code": "def add(a, b):\n    return a + b",
            "model": "kimi-latest",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            "success": True
        }
        mock_client.validate_code.return_value = {
            "syntax_valid": True,
            "can_compile": True,
            "errors": []
        }
        mock_client_class.return_value = mock_client
        
        task_config = {
            "task_id": "test-generate-1",
            "role": "implementer",
            "action": "generate_code",
            "specification": "Write a function to add two numbers",
            "language": "python"
        }
        
        result = await run_agent_task(task_config)
        
        assert result["status"] == "completed"
        assert result["action"] == "generate_code"
        assert "generated_code" in result["output"]
        assert result["output"]["success"] is True
        
        # Verify Kimi client was called
        mock_client_class.assert_called_once_with(api_key="test-key")
        mock_client.generate_code.assert_called_once()
    
    @pytest.mark.asyncio
    @patch('choreographer.workers.worker._worker_credentials', {})  # No credentials
    async def test_task_generate_code_no_key(self):
        """Test generate_code action fails without API key."""
        from choreographer.workers.worker import run_agent_task
        
        task_config = {
            "task_id": "test-generate-2",
            "role": "implementer",
            "action": "generate_code",
            "specification": "Write a function"
        }
        
        result = await run_agent_task(task_config)
        
        assert result["status"] == "failed"
        assert "Kimi API key not available" in result["error"]


class TestCredentialSecurity:
    """Test credential security in worker."""
    
    def test_credentials_not_in_environment(self):
        """Verify credentials are not stored in environment."""
        from choreographer.workers import worker
        
        # Set test credentials
        test_creds = {
            "kimi_key": "secret-key-123",
            "workflow_id": "test-wf"
        }
        
        worker.set_credentials(test_creds)
        
        # Verify credentials are in module storage
        assert worker._worker_credentials["kimi_key"] == "secret-key-123"
        
        # Verify NOT in environment
        assert os.environ.get("KIMI_API_KEY") is None
        assert os.environ.get("kimi_key") is None
    
    def test_set_credentials_logs_presence_not_values(self, caplog):
        """Test that set_credentials logs presence but not actual values."""
        import logging
        from choreographer.workers import worker
        
        # Configure logging to capture INFO
        with caplog.at_level(logging.INFO):
            worker.set_credentials({
                "kimi_key": "secret-value",
                "anthropic_key": "another-secret"
            })
        
        # Should log presence (JSON format with lowercase true/false)
        assert "credentials_loaded" in caplog.text
        assert '"kimi_present": true' in caplog.text
        
        # Should NOT log actual values
        assert "secret-value" not in caplog.text
        assert "another-secret" not in caplog.text
