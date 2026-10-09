# Vendored third-party files

These files are used **at build time only**, to highlight C/C++ code blocks the same way the tutor's Neovim does (see `src/lib/highlight/`). Nothing here ships to the browser.

They are checked in, not installed, so the build pulls no native packages or install scripts. `tests/unit/vendor-integrity.test.ts` fails if any file stops matching the sha256 recorded below. To update a file, replace it, review the diff or source, and update its hash here together with the matching hash in that test.

## tree-sitter grammars (`tree-sitter/`, MIT)

Each prebuilt WebAssembly grammar was extracted from its published npm tarball. `npm pack` verified the registry's sha512 integrity hash before extraction.

| File | Source | npm tarball integrity | sha256 |
| --- | --- | --- | --- |
| `tree-sitter-cpp.wasm` | `tree-sitter-cpp@0.23.4` | `sha512-qR5qUDyhZ5jJ6V8/umiBxokRbe89bCGmcq/dk94wI4kN86qfdV8k0GHIUEKaqWgcu42wKal5E97LKpLeVW8sKw==` | `174eb0deb75b2ec7881bcacda9f995648d8e683956e5c2267e69ab6dc503fcbf` |
| `tree-sitter-c.wasm` | `tree-sitter-c@0.24.1` | `sha512-lkYwWN3SRecpvaeqmFKkuPNR3ZbtnvHU+4XAEEkJdrp3JfSp2pBrhXOtvfsENUneye76g889Y0ddF2DM0gEDpA==` | `c852c2a85ebf2beb636aa3b0ef7f7e70458684d74f6741b20dcb296885bed9f9` |

The licenses are in `tree-sitter/LICENSE-tree-sitter-cpp` and `tree-sitter/LICENSE-tree-sitter-c`.

## nvim-treesitter highlight queries (`nvim-treesitter/`, Apache-2.0)

These are copied verbatim from the tutor's Neovim install of nvim-treesitter (`main` branch, rev `4967fa48b0fe7a7f92cee546c76bb4bb61bb14d5`). They are the queries their editor uses. `cpp` inherits `c`, so `c` patterns are loaded first.

| File | sha256 |
| --- | --- |
| `queries/c/highlights.scm` | `2c473f14247cb168380627ebafe911ebc07052eb71c52950946380156be964f7` |
| `queries/cpp/highlights.scm` | `a10230678cc32f0c45eab0d3109f5bbef9fa65210efb9f0576d0a3ebacc752a8` |

The license is in `nvim-treesitter/LICENSE`.

nvim pins slightly different parser revisions (cpp `12bd6f7e`, c `ae19b676`) than these npm grammars. The queries compile cleanly against both grammars here. Remaining differences are checked against headless Neovim.
