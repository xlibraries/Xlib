// Small workspaces for the graph checker's tests (in fixtures/, which no checker scans as code).

const pkg = (name, deps = {}, extra = {}) => ({ name, version: '1.0.0', dependencies: deps, exports: { '.': './src/index.ts' }, ...extra });

/** Every rule broken at least once, next to edges that are fine. */
export const RULES = {
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/core/package.json': pkg('@s/core'),
    'packages/core/include/core/core.h': '#pragma once\n',
    'packages/core/src/detail.h': '#pragma once\n',
    'packages/core/src/index.ts': 'export const core = 1;\n',
    'packages/a/package.json': pkg('@s/a', { '@s/core': '1.0.0', '@s/b': '1.0.0' }),
    'packages/a/src/index.ts': "import { core } from '@s/core';\nimport { b } from '@s/b';\nimport { x } from '@s/core/src/inner';\nexport const a = core + b + x;\n",
    'packages/a/native/a.cpp': '#include "core/core.h"\n#include "detail.h"\n#include <vector>\n#include "generated.glsl.h"\n',
    'packages/b/package.json': pkg('@s/b', { '@s/core': '1.0.0' }),
    'packages/b/src/index.ts': "import { core } from '@s/core';\nimport { app } from '@s/app';\nexport const b = core;\n",
    'packages/app/package.json': pkg('@s/app', { '@s/a': '1.0.0', '@s/b': '1.0.0' }),
    'packages/app/src/index.ts': "import { a } from '@s/a';\nimport { b } from '@s/b';\nexport const app = a + b;\n",
    'packages/app/src/sim/model.ts': "import React from 'react';\nexport const w = window.innerWidth;\n",
    'packages/stray/package.json': pkg('@s/stray'),
    'packages/stray/src/index.ts': 'export {};\n',
};

/** Units inside one package: a folder, a file-name prefix, a test that belongs to its game. */
export const UNITS = {
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/arcade/package.json': pkg('@s/arcade'),
    'packages/arcade/games/one/main.cpp': '#include "physics.h"\n#include "mesh.h"\n',
    'packages/arcade/games/one/physics.h': '#pragma once\n',
    'packages/arcade/games/one/mesh.h': '#pragma once\n',
    'packages/arcade/games/one/physics_backend.cpp': '#include "physics.h"\n',
    'packages/arcade/tests/one_test.cpp': '#include "games/one/physics.h"\n',
};

/** A script naming modules in every form, and C++ includes, some commented out. */
export const SCRIPT = `import a from 'x';\nexport { b } from "./y";\nconst c = await import('z');\nrequire('w');\nimport 'side';`;
export const NATIVE = '#include "a.h"\n  #  include <b/c.h>\n// #include "no.h"\n/* #include "nor.h" */';
