-- Regenerate tests/fixtures/highlight.cpp.nvim.json from the tutor's own Neovim tree-sitter setup:
--   nvim --clean --headless -l scripts/dev/nvim-captures.lua tests/fixtures/highlight.cpp tests/fixtures/highlight.cpp.nvim.json
-- Records the winning capture per character (no LSP semantic tokens, no plugins), which
-- tests/unit/treesitter.test.ts compares against our build-time highlighter.
vim.opt.rtp:prepend(vim.fn.expand('~/.local/share/nvim/site'))
local file, out = _G.arg[1], _G.arg[2]
vim.cmd('edit ' .. file)
vim.bo.filetype = 'cpp'
vim.treesitter.start(0, 'cpp')
vim.treesitter.get_parser(0):parse()
local ignored = { spell = true, nospell = true, conceal = true }
local res = {}
for row, text in ipairs(vim.api.nvim_buf_get_lines(0, 0, -1, false)) do
  local caps = {}
  for col = 0, #text - 1 do
    local best, bestPrio = '', -1
    for _, c in ipairs(vim.treesitter.get_captures_at_pos(0, row - 1, col)) do
      if not c.capture:match('^_') and not ignored[c.capture] then
        local prio = tonumber(c.metadata and c.metadata.priority) or 100
        if prio >= bestPrio then best, bestPrio = c.capture, prio end
      end
    end
    caps[#caps + 1] = best
  end
  res[#res + 1] = caps
end
local f = assert(io.open(out, 'w'))
f:write(vim.json.encode(res))
f:close()
vim.cmd('qa!')
