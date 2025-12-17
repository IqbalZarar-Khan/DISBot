# Contributing to Patreon-Discord Bot

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in Issues
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Relevant logs or screenshots

### Suggesting Features

1. Check if the feature has been suggested
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test thoroughly
5. Commit with clear messages
6. Push to your fork
7. Create a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/DISBot.git
cd DISBot

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Fill in your test credentials

# Run in development mode
npm run dev
```

## Code Style

- Use TypeScript strict mode
- Follow existing code formatting
- Add comments for complex logic
- Use meaningful variable names
- Keep functions focused and small

## Testing

Before submitting a PR:

```bash
# Verify TypeScript compilation
npm run build

# Run verification checks
npm run verify

# Test webhook handlers
npm run test:webhooks
```

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add force-sync command for member data
fix: resolve webhook signature verification issue
docs: update deployment guide for Docker
refactor: improve error handling in webhook handlers
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
