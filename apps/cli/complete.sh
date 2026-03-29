#!/usr/bin/env bash
# Ultimate System CLI - Shell Completion
# Add to ~/.bashrc or ~/.zshrc: source /path/to/complete.sh

_ultimate() {
    local cur prev words cword
    _init_completion || return
    
    local commands="dashboard monitor create approve tasks task workers login help"
    local options="-u --url -e --email -k --api-key --version --help"
    
    # Command completion
    if [[ $cword -eq 1 ]] || [[ "${words[1]}" == -* ]]; then
        COMPREPLY=( $(compgen -W "$commands $options" -- "$cur") )
        return
    fi
    
    # Subcommand completion
    case "${words[1]}" in
        task)
            if [[ $cword -eq 2 ]]; then
                # Would need API call to get task IDs
                COMPREPLY=( $(compgen -W "<task-id>" -- "$cur") )
            fi
            ;;
        *)
            COMPREPLY=( $(compgen -W "$options" -- "$cur") )
            ;;
    esac
}

complete -F _ultimate ultimate
complete -F _ultimate ultimate.js
