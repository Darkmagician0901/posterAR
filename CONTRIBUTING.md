# Contributing to XR Poster

Thank you for your interest in contributing to XR Poster! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Issue Reporting](#issue-reporting)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors, regardless of experience level, gender, gender identity and expression, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, or nationality.

### Expected Behavior

- Be respectful and considerate
- Use welcoming and inclusive language
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, trolling, or discriminatory comments
- Personal or political attacks
- Publishing others' private information
- Any conduct that could reasonably be considered inappropriate

---

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- Git
- A code editor (VS Code recommended)
- A mobile device with a camera (iOS Safari 16.4+ / Android Chrome) for live AR testing — desktop runs the built-in webcam mock mode

### Fork and Clone

1. **Fork the repository** on GitHub

2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/xr-poster.git
   cd xr-poster
   ```

3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/xr-poster.git
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

---

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Urgent production fixes

### Creating a Feature Branch

```bash
# Update your local main branch
git checkout main
git pull upstream main

# Create a feature branch
git checkout -b feature/your-feature-name
```

### Making Changes

1. **Make your changes** in the feature branch

2. **Test your changes:**
   ```bash
   npm run test
   npm run type-check
   npm run build
   ```

3. **Test on mobile device** (required for AR features)

4. **Commit your changes** (see [Commit Guidelines](#commit-guidelines))

5. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

### Keeping Your Branch Updated

```bash
# Fetch upstream changes
git fetch upstream

# Rebase your branch
git rebase upstream/main

# Force push if needed (only on your fork)
git push origin feature/your-feature-name --force
```

---

## Coding Standards

### TypeScript

- **Use TypeScript** for all new code
- **Enable strict mode** - already configured in `tsconfig.json`
- **Define types explicitly** - avoid `any` unless absolutely necessary
- **Use interfaces** for object shapes
- **Use type aliases** for unions and complex types

**Example:**
```typescript
// Good
interface PosterData {
  id: string;
  imageUrl: string;
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
}

// Avoid
const poster: any = { ... };
```

### React

- **Use functional components** with hooks
- **Use custom hooks** for reusable logic
- **Memoize expensive computations** with `useMemo`
- **Memoize callbacks** with `useCallback`
- **Clean up effects** properly

**Example:**
```typescript
// Good
const MyComponent: React.FC<Props> = ({ data }) => {
  const processedData = useMemo(() => processData(data), [data]);
  
  useEffect(() => {
    const cleanup = setupListener();
    return () => cleanup();
  }, []);
  
  return <div>{processedData}</div>;
};
```

### File Organization

```
src/
├── components/       # React components
│   ├── ar/          # StoryARExperience (live 8th Wall), DesktopMockMode; ARExperience retained but unused (legacy)
│   ├── ui/          # UI components (+ co-located .css)
│   └── layout/      # Header, MainLayout
├── hooks/           # Custom React hooks / UI store
├── xr/              # Engine-agnostic 3D helpers (reticle, telemetry, mock driver)
├── xr8/             # 8th Wall (XR8) engine integration
├── store/           # State management (Zustand)
├── utils/           # Utility functions
└── types/           # TypeScript type definitions
```

### Naming Conventions

- **Components:** PascalCase (`PosterGallery.tsx`)
- **Hooks:** camelCase with `use` prefix (`useUIState.ts`)
- **Utilities:** camelCase (`deviceDetection.ts`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_POSTERS`)
- **Types/Interfaces:** PascalCase (`Poster`, `XRSupport`)
- **CSS files:** Match component name (`PosterGallery.css`)

### Code Style

- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Required
- **Line length:** Max 100 characters (soft limit)
- **Trailing commas:** Yes (for multi-line)

**Example:**
```typescript
const config = {
  maxPosters: 10,
  allowedTypes: ['image/jpeg', 'image/png'],
  defaultScale: 1.0,
};
```

### Comments

- **Use JSDoc** for functions and components
- **Explain "why"** not "what"
- **Keep comments up-to-date**
- **Remove commented-out code**

**Example:**
```typescript
/**
 * Calculates the optimal poster scale based on device capabilities
 * to ensure good performance on low-end devices.
 * 
 * @param deviceTier - Device performance tier (low, medium, high)
 * @returns Optimal scale factor
 */
function calculateOptimalScale(deviceTier: DeviceTier): number {
  // Low-end devices need smaller posters to maintain 30 FPS
  if (deviceTier === 'low') return 0.5;
  return 1.0;
}
```

---

## Commit Guidelines

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `ci` - CI/CD changes

### Scopes

- `ar` - AR functionality (scene, reticle, placement)
- `gif` - GIF decode, animation, playhead
- `poster` - Poster mesh, texture cache, placement
- `upload` - Image upload and validation
- `ui` - User interface
- `xr8` - 8th Wall (XR8) engine integration
- `xr` - Engine-agnostic 3D helpers / telemetry
- `csp` - Content-Security-Policy headers
- `diag` - Diagnostic HUD / breadcrumb tracing
- `screenshot` - Screenshot feature
- `build` - Build configuration
- `deps` - Dependencies

### Examples

```bash
# Feature
git commit -m "feat(gif): add CanvasTexture animator"

# Bug fix
git commit -m "fix(xr8): expose window.THREE for 8th Wall pipeline"

# Documentation
git commit -m "docs: update deployment guide for Cloudflare Pages"

# Chore / diagnostics
git commit -m "chore(diag): full tap→place breadcrumbs + on-demand HUD toggle"

# Test
git commit -m "test(poster): unit tests for placement and texture cache"

# With body
git commit -m "feat(upload): add GIF support with animated CanvasTexture

Preserve GIF frames through gifuct-js decode and drive playback
via a shared refcounted animator cache. Non-GIF images continue
to be compressed to WebP before placement.

Closes #123"
```

### Commit Best Practices

- **One logical change per commit**
- **Write clear, descriptive messages**
- **Reference issues** when applicable
- **Keep commits atomic** - each commit should work independently
- **Squash fixup commits** before submitting PR

---

## Pull Request Process

### Before Submitting

1. **Ensure all tests pass:**
   ```bash
   npm run test
   npm run type-check
   npm run build
   ```

2. **Test on mobile device** (for AR features)

3. **Update documentation** if needed

4. **Add/update tests** for new features

5. **Rebase on latest main:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Creating a Pull Request

1. **Push your branch** to your fork

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template:**
   - Description of changes
   - Related issues
   - Testing performed
   - Screenshots/videos (for UI changes)
   - Checklist completion

4. **Request review** from maintainers

### PR Title Format

Use the same format as commit messages:

```
feat(ar): add poster rotation gesture
fix(gestures): prevent pinch zoom on iOS Safari
docs: update deployment guide
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Related Issues
Closes #123
Relates to #456

## Changes Made
- Added X feature
- Fixed Y bug
- Refactored Z component

## Testing
- [ ] `npm run test` passes (all 86 automated tests)
- [ ] `npm run type-check` passes
- [ ] Build succeeds
- [ ] Tested on iOS Safari 16.4+ (for AR features)
- [ ] Tested on Android Chrome (for AR features)
- [ ] No console errors

## Screenshots/Videos
[Add screenshots or videos demonstrating the changes]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings introduced
- [ ] Tested on mobile device
```

### Review Process

1. **Automated checks** must pass (tests, type check, build)
2. **Code review** by at least one maintainer
3. **Testing** on mobile devices (if applicable)
4. **Address feedback** and push updates
5. **Approval** from maintainer
6. **Merge** by maintainer (squash and merge)

### After Merge

1. **Delete your branch:**
   ```bash
   git branch -d feature/your-feature-name
   git push origin --delete feature/your-feature-name
   ```

2. **Update your local main:**
   ```bash
   git checkout main
   git pull upstream main
   ```

---

## Testing Requirements

### Automated Tests

Run the full vitest suite before every push or PR:

```bash
npm run test
# Expected: 86 tests pass, no failures
```

During active development, watch mode is useful:

```bash
npm run test:watch
```

### Type Checking

All code must pass TypeScript type checking:

```bash
npm run type-check
```

### Build Testing

Ensure production build succeeds:

```bash
npm run build
```

### Manual Testing

Automated tests cover pure logic only. For anything that requires the live camera, SLAM, or on-device rendering, test manually:

- **iOS:** Safari 16.4+ on iPhone (needs WebAssembly SIMD)
- **Android:** Chrome on Android device
- **Desktop:** webcam mock mode (for non-AR logic)

### Testing Checklist

- [ ] All automated tests pass (`npm run test`)
- [ ] 8th Wall engine loads and AR session starts (Diagnostic Panel turns green)
- [ ] Camera permission prompt appears
- [ ] Hit-test reticle locks to a surface (searching → tracking)
- [ ] Tap-to-place works; placed poster is selected
- [ ] Scale slider resizes the poster; delete removes it
- [ ] Custom poster upload + gallery selection work
- [ ] UI is responsive
- [ ] No console errors
- [ ] Performance is acceptable (30+ FPS)

---

## Documentation

### Code Documentation

- **Add JSDoc comments** for public functions and components
- **Document complex logic** with inline comments
- **Keep comments up-to-date** with code changes

### README Updates

Update `README.md` if you:
- Add new features
- Change installation steps
- Modify configuration
- Add new dependencies

### Architecture Documentation

Update `ARCHITECTURE.md` if you:
- Change project structure
- Add new architectural patterns
- Modify data flow
- Change state management

---

## Issue Reporting

### Before Creating an Issue

1. **Search existing issues** to avoid duplicates
2. **Check documentation** for solutions
3. **Test on latest version**
4. **Reproduce the issue** consistently

### Bug Report Template

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Device: iPhone 14 Pro
- OS: iOS 17.0
- Browser: Safari 17.0
- App Version: 1.0.0

## Screenshots/Videos
[Add screenshots or videos]

## Console Errors
[Add any console errors]

## Additional Context
Any other relevant information
```

### Feature Request Template

```markdown
## Feature Description
Clear description of the feature

## Use Case
Why is this feature needed?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Other approaches you've thought about

## Additional Context
Any other relevant information
```

---

## Questions?

If you have questions about contributing:
- Check existing [GitHub Issues](https://github.com/yourusername/xr-poster/issues)
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- Review [DEPLOYMENT.md](DEPLOYMENT.md) for deployment info
- Open a new issue with the `question` label

---

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes
- Project README (for significant contributions)

Thank you for contributing to XR Poster! 🎯

---

**Last Updated:** 2026-06-23  
**Version:** 1.0.0