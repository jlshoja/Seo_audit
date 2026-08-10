# AI Development Agent Rules

## Purpose

This document defines the mandatory development workflow rules for AI coding agents.

These rules apply to:

* OpenCode
* Claude Code
* Codex CLI
* Hermes
* Other AI-assisted development environments

The purpose of these rules is to keep the Git repository safe, organized, traceable, and production-ready.

---

# 1. Mandatory Pre-Development Check

Before creating, modifying, deleting, or refactoring any code, the AI agent MUST check the current Git repository state.

The agent must run:

```bash
git status
```

Then check the current branch:

```bash
git branch --show-current
```

Then check the latest commit:

```bash
git log -1 --oneline
```

Before starting development, the agent must report:

```
Current branch:
Working tree status:
Last commit:
Remote synchronization status:
```

The agent must understand the repository state before making any changes.

---

# 2. Branch Safety Policy

## Main Rule

The AI agent MUST NOT start development directly on:

```
main
master
```

unless the user explicitly requests it.

The main/master branch should always represent a stable version of the project.

---

## If Current Branch Is main/master

Before writing or modifying code, create a dedicated development branch.

Example:

```bash
git checkout -b feature/<task-name>
```

Examples:

```
feature/add-api-validator

feature/improve-image-processing

bugfix/fix-pipeline-resume

refactor/config-management
```

---

# 3. Existing Changes Check

Before starting a new task, the agent must check whether previous changes exist.

Run:

```bash
git status
```

If there are modified or untracked files, the agent MUST NOT ignore them.

The previous work must be handled first.

---

# 4. Handling Previous Changes

## Case 1: Previous Work Is Completed

If previous changes are finished:

Stage changes:

```bash
git add .
```

Create a commit:

```bash
git commit -m "Complete previous work before starting new task"
```

Push changes:

```bash
git push origin <current-branch>
```

After successful synchronization, continue with the new task.

---

## Case 2: Previous Work Is Not Completed

If previous work is incomplete:

Create a checkpoint commit.

Run:

```bash
git add .
```

Then:

```bash
git commit -m "WIP: checkpoint before new development"
```

The agent must clearly inform the user that unfinished work was saved as a checkpoint.

---

# 5. Standard Development Workflow

Every development task must follow this sequence:

```
1. Check Git status

2. Confirm current branch

3. Create feature branch if required

4. Handle previous changes

5. Make code changes

6. Run tests

7. Review changes

8. Commit changes

9. Push branch

10. Merge after validation
```

---

# 6. Commit Rules

Every commit must:

* Represent one logical change
* Have a meaningful message
* Avoid unrelated modifications

Good examples:

```
Add API key validation module

Fix pipeline resume state handling

Refactor Excel utility functions

Update migration documentation
```

Bad examples:

```
changes

update

fix
```

---

# 7. Merge Rules

Before merging any branch:

## Step 1: Update target branch

Example:

```bash
git checkout master

git pull origin master
```

## Step 2: Merge feature branch

Example:

```bash
git merge <feature-branch>
```

## Step 3:

* Resolve conflicts if necessary
* Run tests
* Verify application behavior

## Step 4:

Push final result:

```bash
git push origin master
```

---

# 8. Remote Synchronization Rules

Before starting important development, the agent must verify synchronization.

Run:

```bash
git status
```

If Git reports that the branch is behind the remote:

Update first:

```bash
git pull
```

The agent must not continue development on an outdated branch.

---

# 9. AI Agent Restrictions

The AI agent MUST NOT:

* Modify code directly on main/master without permission
* Delete branches without confirmation
* Force push without explicit approval
* Rewrite history without approval
* Ignore existing uncommitted changes
* Start new development on unknown repository state

---

# 10. Documentation Requirement

Important changes must update related documentation.

Examples:

```
README.md

docs/

CHANGELOG.md

MIGRATION_STATUS.md

ARCHITECTURE.md
```

Code changes without necessary documentation updates are incomplete.

---

# 11. Completion Report

After completing a task, the agent must provide:

```
Task:

Branch:

Files changed:

Tests executed:

Commit:

Push status:

Merge status:
```

Example:

```
Task:
Fix pipeline resume integrity

Branch:
fix-pipeline-resume-integrity

Files changed:
3 Python files
1 documentation file

Tests:
Passed

Commit:
abc123

Push:
Completed

Merge:
Waiting for approval
```

---

# 12. Golden Rule

Before writing new code:

> The repository must have a known state, the correct branch must be selected, previous changes must be committed or checkpointed, and only then new development may begin.

The standard workflow is:

```
Clean Git State
        ↓
Correct Branch
        ↓
Development
        ↓
Testing
        ↓
Commit
        ↓
Push
        ↓
Merge
```

---

# Implementation

Place this file in the root directory of every project:

```
project-root/

├── AGENTS.md
├── README.md
├── src/
├── tests/
└── docs/
```

All AI coding agents must follow this document before performing any development activity.