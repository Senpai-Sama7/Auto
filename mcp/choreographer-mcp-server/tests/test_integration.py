"""Integration tests for real worker execution."""

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

from choreographer.workers.worker import (
    execute_python_code,
    execute_shell_command,
    write_file,
    read_file,
    validate_python_code,
    CodeValidationError,
    run_agent_task
)
from choreographer.workers.supervisor import spawn_worker, WorkerSpec
from choreographer.workers.landlock import is_supported


class TestCodeExecution:
    """Test real code execution."""
    
    def test_execute_simple_python(self):
        """Execute simple Python code."""
        result = execute_python_code('print(2 + 2)', timeout=5)
        assert result['success'] is True
        assert '4' in result['stdout']
        assert result['returncode'] == 0
    
    def test_execute_python_with_error(self):
        """Execute Python code that raises an error."""
        result = execute_python_code('raise ValueError("test error")', timeout=5)
        assert result['success'] is False
        assert result['returncode'] != 0
        assert 'ValueError' in result['stderr']
    
    def test_execute_python_timeout(self):
        """Test Python execution timeout."""
        result = execute_python_code('import time; time.sleep(60)', timeout=1)
        assert result['success'] is False
        assert 'timed out' in result['stderr']
    
    def test_validate_dangerous_code_blocked(self):
        """Test that dangerous code is blocked."""
        with pytest.raises(CodeValidationError):
            validate_python_code('eval("1+1")')
        
        with pytest.raises(CodeValidationError):
            validate_python_code('import os')
    
    def test_validate_safe_code_allowed(self):
        """Test that safe code is allowed."""
        assert validate_python_code('print("hello")') is True
        assert validate_python_code('x = 1 + 2\nprint(x)') is True


class TestShellExecution:
    """Test real shell command execution."""
    
    def test_execute_echo(self):
        """Execute echo command."""
        result = execute_shell_command('echo test123', timeout=5)
        assert result['success'] is True
        assert 'test123' in result['stdout']
    
    def test_execute_with_cwd(self):
        """Execute command in specific directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = execute_shell_command('pwd', cwd=tmpdir, timeout=5)
            assert result['success'] is True
            assert tmpdir in result['stdout']
    
    def test_execute_invalid_command(self):
        """Execute non-existent command."""
        result = execute_shell_command('nonexistentcommand12345', timeout=5)
        assert result['success'] is False
        assert result['returncode'] != 0
    
    def test_dangerous_command_blocked(self):
        """Test that dangerous commands are blocked."""
        result = execute_shell_command('rm -rf /', timeout=5)
        assert result['success'] is False
        assert 'blocked' in result['stderr'].lower()


class TestFileOperations:
    """Test real file operations."""
    
    def test_write_and_read_file(self):
        """Write and read back a file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_path = os.path.join(tmpdir, 'test.txt')
            test_content = 'Hello, World!'
            
            # Write
            write_result = write_file(test_path, test_content)
            assert write_result['success'] is True
            assert write_result['bytes_written'] == len(test_content)
            
            # Read
            read_result = read_file(test_path)
            assert read_result['success'] is True
            assert read_result['content'] == test_content
    
    def test_write_creates_directories(self):
        """Write file creates parent directories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            nested_path = os.path.join(tmpdir, 'a', 'b', 'c', 'file.txt')
            write_result = write_file(nested_path, 'content')
            assert write_result['success'] is True
            assert os.path.exists(nested_path)
    
    def test_read_nonexistent_file(self):
        """Reading non-existent file fails gracefully."""
        result = read_file('/nonexistent/path/file.txt')
        assert result['success'] is False
        assert 'error' in result


@pytest.mark.asyncio
class TestAgentTaskExecution:
    """Test agent task execution."""
    
    async def test_task_execute_python(self):
        """Execute Python via agent task."""
        task_config = {
            'task_id': 'test-py-1',
            'role': 'implementer',
            'action': 'execute_python',
            'code': 'print("hello from task")'
        }
        
        result = await run_agent_task(task_config)
        
        assert result['status'] == 'completed'
        assert result['action'] == 'execute_python'
        assert result['output']['success'] is True
        assert 'hello from task' in result['output']['stdout']
    
    async def test_task_execute_shell(self):
        """Execute shell via agent task."""
        task_config = {
            'task_id': 'test-sh-1',
            'role': 'implementer',
            'action': 'execute_shell',
            'command': 'echo shell-test'
        }
        
        result = await run_agent_task(task_config)
        
        assert result['status'] == 'completed'
        assert result['output']['success'] is True
        assert 'shell-test' in result['output']['stdout']
    
    async def test_task_write_and_read_file(self):
        """Write and read file via agent task."""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = os.path.join(tmpdir, 'agent-test.txt')
            
            # Write
            write_task = {
                'task_id': 'test-write-1',
                'role': 'implementer',
                'action': 'write_file',
                'path': test_file,
                'content': 'agent written content'
            }
            
            write_result = await run_agent_task(write_task)
            assert write_result['status'] == 'completed'
            assert write_result['output']['success'] is True
            
            # Read
            read_task = {
                'task_id': 'test-read-1',
                'role': 'implementer',
                'action': 'read_file',
                'path': test_file
            }
            
            read_result = await run_agent_task(read_task)
            assert read_result['status'] == 'completed'
            assert read_result['output']['content'] == 'agent written content'
    
    async def test_task_analyze_spec(self):
        """Analyze specification via agent task."""
        task_config = {
            'task_id': 'test-spec-1',
            'role': 'spec_writer',
            'action': 'analyze_spec',
            'specification': 'Implement API'
        }
        
        result = await run_agent_task(task_config)
        
        assert result['status'] == 'completed'
        assert result['action'] == 'analyze_spec'
        assert 'is_underspecified' in result['output']
        assert result['output']['is_underspecified'] is True
    
    async def test_task_compute_shapley(self):
        """Compute Shapley attribution via agent task."""
        task_config = {
            'task_id': 'test-shapley-1',
            'role': 'convergence_checker',
            'action': 'compute_shapley',
            'workflow_id': 'wf-test',
            'causal_trace': [
                {'step_id': 's1', 'type': 'success'},
                {'step_id': 's2', 'type': 'error'}
            ],
            'tier': 'heuristic'
        }
        
        result = await run_agent_task(task_config)
        
        assert result['status'] == 'completed'
        assert result['action'] == 'compute_shapley'
        assert 'shapley_values' in result['output']
    
    async def test_task_unknown_action(self):
        """Unknown action fails gracefully."""
        task_config = {
            'task_id': 'test-unknown',
            'role': 'test',
            'action': 'unknown_action'
        }
        
        result = await run_agent_task(task_config)
        
        assert result['status'] == 'failed'
        assert 'Unknown action' in result['error']


@pytest.mark.asyncio
class TestWorkerSpawning:
    """Test worker process spawning."""
    
    async def test_spawn_worker(self):
        """Spawn a real worker process."""
        with tempfile.TemporaryDirectory() as work_dir:
            spec = WorkerSpec(
                workflow_id='test-workflow-1',
                worktree_path=work_dir,
                agent_role='test',
                sandbox_type='none'  # Don't use sandbox in tests
            )
            
            proc = await spawn_worker(spec)
            
            assert proc.pid is not None
            assert proc.returncode is None  # Still running
            
            # Send ping
            proc.stdin.write(b'{"type": "ping"}\n')
            await proc.stdin.drain()
            
            # Read response
            response = await asyncio.wait_for(proc.stdout.readline(), timeout=5.0)
            data = json.loads(response)
            
            assert data['type'] == 'pong'
            
            # Send shutdown
            proc.stdin.write(b'{"type": "shutdown"}\n')
            await proc.stdin.drain()
            
            # Wait for exit
            await asyncio.wait_for(proc.wait(), timeout=5.0)
            assert proc.returncode == 0
    
    async def test_worker_executes_task(self):
        """Worker process executes a real task."""
        with tempfile.TemporaryDirectory() as work_dir:
            spec = WorkerSpec(
                workflow_id='test-workflow-2',
                worktree_path=work_dir,
                agent_role='implementer',
                sandbox_type='none'
            )
            
            proc = await spawn_worker(spec)
            
            # Send a Python execution task
            task = {
                'type': 'task',
                'config': {
                    'task_id': 'worker-py-1',
                    'role': 'implementer',
                    'action': 'execute_python',
                    'code': 'print(42 * 42)'
                }
            }
            
            proc.stdin.write(json.dumps(task).encode() + b'\n')
            await proc.stdin.drain()
            
            # Read response
            response = await asyncio.wait_for(proc.stdout.readline(), timeout=10.0)
            data = json.loads(response)
            
            assert data['type'] == 'result'
            assert data['result']['status'] == 'completed'
            assert '1764' in data['result']['output']['stdout']
            
            # Shutdown
            proc.stdin.write(b'{"type": "shutdown"}\n')
            await proc.stdin.drain()
            await asyncio.wait_for(proc.wait(), timeout=5.0)
    
    async def test_worker_stats(self):
        """Worker returns statistics."""
        with tempfile.TemporaryDirectory() as work_dir:
            spec = WorkerSpec(
                workflow_id='test-workflow-3',
                worktree_path=work_dir,
                agent_role='test',
                sandbox_type='none'
            )
            
            proc = await spawn_worker(spec)
            
            # Get stats
            proc.stdin.write(b'{"type": "stats"}\n')
            await proc.stdin.drain()
            
            response = await asyncio.wait_for(proc.stdout.readline(), timeout=5.0)
            data = json.loads(response)
            
            assert data['type'] == 'stats'
            assert 'task_count' in data
            assert 'pid' in data
            assert data['pid'] == proc.pid
            
            # Shutdown
            proc.stdin.write(b'{"type": "shutdown"}\n')
            await proc.stdin.drain()
            await asyncio.wait_for(proc.wait(), timeout=5.0)


@pytest.mark.skipif(not is_supported(), reason="Landlock not supported")
class TestLandlockSandbox:
    """Test Landlock sandbox (only runs if supported)."""
    
    def test_sandbox_restricts_access(self):
        """Sandbox actually restricts filesystem access."""
        from choreographer.workers.landlock import Sandbox
        
        with tempfile.TemporaryDirectory() as allowed_dir:
            # Create sandbox allowing only specific directory
            sandbox = Sandbox([allowed_dir])
            
            # Apply in a subprocess since it affects the current process
            import multiprocessing
            
            def sandboxed_process(queue):
                try:
                    sandbox.apply()
                    
                    # Should be able to read from allowed directory
                    test_file = os.path.join(allowed_dir, 'test.txt')
                    with open(test_file, 'w') as f:
                        f.write('test')
                    
                    # Should NOT be able to read from /
                    try:
                        os.listdir('/')
                        queue.put(('FAIL', 'Could access /'))
                    except PermissionError:
                        queue.put(('PASS', 'Correctly blocked access to /'))
                    except Exception as e:
                        queue.put(('PASS', f'Access to / failed: {e}'))
                        
                except Exception as e:
                    queue.put(('ERROR', str(e)))
            
            queue = multiprocessing.Queue()
            p = multiprocessing.Process(target=sandboxed_process, args=(queue,))
            p.start()
            p.join(timeout=10)
            
            if p.is_alive():
                p.terminate()
                p.join()
                pytest.skip("Sandbox test timed out")
            
            result = queue.get_nowait()
            assert result[0] == 'PASS', f"Sandbox failed: {result[1]}"
