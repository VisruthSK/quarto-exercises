local defaults = {
  instant = false,
  reveal = false,
  lock = false,
  reset = true,
  shuffle = false,
  ["reshuffle-on-reset"] = false,
  explanation = "correct",
  ["feedback-correct"] = "Correct!",
  ["feedback-incorrect"] = "Not quite.",
  ["ignore-case"] = false,
  ["obfuscate-answers"] = true,
  ["question-boxes"] = false,
  ["check-page"] = false,
  score = false,
  points = 1
}

local options = {}
for key, value in pairs(defaults) do
  options[key] = value
end

local exercise_attrs = {
  id = true,
  class = true,
  shuffle = true,
  ["reshuffle-on-reset"] = true,
  instant = true,
  reveal = true,
  lock = true,
  reset = true,
  explanation = true,
  ["feedback-correct"] = true,
  ["feedback-incorrect"] = true,
  ["question-boxes"] = true,
  ["option-columns"] = true,
  points = true
}

local blank_attrs = {
  id = true,
  class = true,
  answer = true,
  answers = true,
  match = true,
  ["ignore-case"] = true,
  trim = true,
  ["collapse-space"] = true,
  ["feedback-correct"] = true,
  ["feedback-incorrect"] = true,
  points = true
}

local choose_attrs = {
  id = true,
  class = true,
  answer = true,
  options = true,
  ["ignore-case"] = true,
  shuffle = true,
  ["feedback-correct"] = true,
  ["feedback-incorrect"] = true,
  points = true
}

local bool_attrs = {
  shuffle = true,
  ["reshuffle-on-reset"] = true,
  instant = true,
  reveal = true,
  lock = true,
  reset = true,
  correct = true,
  ["ignore-case"] = true,
  trim = true,
  ["collapse-space"] = true,
  ["question-boxes"] = true
}

-- Cryptographic primitives for answer obfuscation (SHA-256 and simple XOR cipher)
local sha256 = {}
local rrotate = function(x, n)
  return ((x >> n) | (x << (32 - n))) & 0xffffffff
end
local rshift = function(x, n)
  return (x >> n) & 0xffffffff
end

local h_init = {
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
}

local k_constants = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
}

local function str_to_words(str)
  local words = {}
  for i = 1, #str, 4 do
    local b1, b2, b3, b4 = string.byte(str, i, i + 3)
    b2 = b2 or 0
    b3 = b3 or 0
    b4 = b4 or 0
    words[#words + 1] = (b1 << 24) | (b2 << 16) | (b3 << 8) | b4
  end
  return words
end

local function words_to_str(words)
  local bytes = {}
  for _, w in ipairs(words) do
    bytes[#bytes + 1] = string.char(
      (w >> 24) & 0xff,
      (w >> 16) & 0xff,
      (w >> 8) & 0xff,
      w & 0xff
    )
  end
  return table.concat(bytes)
end

function sha256.sha256(msg)
  local h = { table.unpack(h_init) }
  local extra = #msg % 64
  local padding_len = 64 - extra
  if padding_len < 9 then
    padding_len = padding_len + 64
  end
  
  local padding = string.char(0x80) .. string.rep(string.char(0), padding_len - 9)
  local bit_len = #msg * 8
  local len_str = string.char(
    (bit_len >> 56) & 0xff,
    (bit_len >> 48) & 0xff,
    (bit_len >> 40) & 0xff,
    (bit_len >> 32) & 0xff,
    (bit_len >> 24) & 0xff,
    (bit_len >> 16) & 0xff,
    (bit_len >> 8) & 0xff,
    bit_len & 0xff
  )
  
  local padded_msg = msg .. padding .. len_str
  local words = str_to_words(padded_msg)
  
  for chunk_start = 1, #words, 16 do
    local w = {}
    for i = 1, 16 do w[i] = words[chunk_start + i - 1] end
    for i = 17, 64 do
      local s0 = rrotate(w[i - 15], 7) ~ rrotate(w[i - 15], 18) ~ rshift(w[i - 15], 3)
      local s1 = rrotate(w[i - 2], 17) ~ rrotate(w[i - 2], 19) ~ rshift(w[i - 2], 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & 0xffffffff
    end
    
    local a, b, c, d, e, f, g, h_val = table.unpack(h)
    
    for i = 1, 64 do
      local S1 = rrotate(e, 6) ~ rrotate(e, 11) ~ rrotate(e, 25)
      local ch = (e & f) ~ (~e & g)
      local temp1 = (h_val + S1 + ch + k_constants[i] + w[i]) & 0xffffffff
      local S0 = rrotate(a, 2) ~ rrotate(a, 13) ~ rrotate(a, 22)
      local maj = (a & b) ~ (a & c) ~ (b & c)
      local temp2 = (S0 + maj) & 0xffffffff
      
      h_val = g
      g = f
      f = e
      e = (d + temp1) & 0xffffffff
      d = c
      c = b
      b = a
      a = (temp1 + temp2) & 0xffffffff
    end
    
    h[1] = (h[1] + a) & 0xffffffff
    h[2] = (h[2] + b) & 0xffffffff
    h[3] = (h[3] + c) & 0xffffffff
    h[4] = (h[4] + d) & 0xffffffff
    h[5] = (h[5] + e) & 0xffffffff
    h[6] = (h[6] + f) & 0xffffffff
    h[7] = (h[7] + g) & 0xffffffff
    h[8] = (h[8] + h_val) & 0xffffffff
  end
  return words_to_str(h)
end

local json_encode

local function json_decode(str)
  local res = {}
  
  local payload = str:match('"payload"%s*:%s*"([^"]+)"')
  if payload then
    res.payload = payload
  end
  
  local pageKey = str:match('"pageKey"%s*:%s*"([^"]+)"')
  if pageKey then
    res.pageKey = pageKey
  end

  local pub_x = str:match('"x"%s*:%s*"([^"]+)"')
  local pub_y = str:match('"y"%s*:%s*"([^"]+)"')
  local pub_crv = str:match('"crv"%s*:%s*"([^"]+)"')
  local pub_kty = str:match('"kty"%s*:%s*"([^"]+)"')
  if pub_x then
    res.publicKey = {
      x = pub_x,
      y = pub_y,
      crv = pub_crv,
      kty = pub_kty
    }
  end
  
  local regex_payload = str:match('"regexPayload"%s*:%s*"([^"]+)"')
  if regex_payload then
    res.regexPayload = regex_payload
  end
  
  local sigs_str = str:match('"signatures"%s*:%s*%[(.-)%]')
  if sigs_str then
    local signatures = {}
    for sig in sigs_str:gmatch('"([a-f0-9]+)"') do
      signatures[#signatures + 1] = sig
    end
    res.signatures = signatures
  end
  
  return res
end

local doc_id = "default-doc"

local key_script_emitted = false
local function get_key_script()
  if key_script_emitted then
    return ""
  end
  local key = options["_page_key"]
  if options["obfuscate-answers"] and not key then
    return ""
  end
  key_script_emitted = true
  local key_val = key or ""
  local check_mode = options["check-page"] == true and "page" or "exercise"
  local score_val = tostring(options["score"] == true)
  return '<script type="text/javascript">/* protects against static source inspection, not runtime inspection */ window.quartoExercisesKey = "' .. key_val .. '"; window.quartoExercisesDocId = "' .. doc_id .. '"; window.quartoExercisesCheckMode = "' .. check_mode .. '"; window.quartoExercisesScore = ' .. score_val .. ';</script>'
end

local function protectAnswer(spec)
  spec.documentId = doc_id
  spec.key = options["_key"]
  local json_input = json_encode(spec)
  local filter_dir = PANDOC_SCRIPT_FILE:match("(.*[/\\])") or ""
  local helper_path = filter_dir .. "crypto-helper.mjs"
  local ok, output = pcall(pandoc.pipe, "node", { helper_path }, json_input)
  if not ok then
    error("quarto-exercises error: Failed to run crypto-helper.mjs. Make sure Node.js is installed and QUARTO_EXERCISES_KEY is set.")
  end
  local res = json_decode(output)
  if not res or not res.payload then
    error("quarto-exercises error: Failed to encrypt payload. Node stdout was: " .. tostring(output))
  end
  if res and res.pageKey then
    options["_page_key"] = res.pageKey
  end
  return res
end

local counter = 0
local alphabet = {}
for i = 65, 90 do
  alphabet[#alphabet + 1] = string.char(i)
end

local function html()
  return FORMAT:match("html")
end

local function id_for(el, prefix)
  if el.identifier and el.identifier ~= "" then
    return el.identifier
  end
  counter = counter + 1
  return prefix .. "-" .. counter
end

local function alpha_key(index)
  local key = ""
  while index > 0 do
    local remainder = (index - 1) % #alphabet
    key = alphabet[remainder + 1] .. key
    index = math.floor((index - 1) / #alphabet)
  end
  return key
end

local function normalize_bool(value)
  if value == nil or value == "" then
    return value
  end
  return string.lower(tostring(value))
end

local function is_bool(value)
  return value == nil or value == "" or value == "true" or value == "false"
end

local function warn(id, msg)
  local label = id and id ~= "" and ("exercise: #" .. id .. " ") or "exercise: "
  io.stderr:write("quarto-exercises warning: " .. label .. msg .. "\n")
end

local function html_escape(value)
  if value == nil then
    return ""
  end
  return tostring(value)
    :gsub("&", "&amp;")
    :gsub('"', "&quot;")
    :gsub("<", "&lt;")
    :gsub(">", "&gt;")
end

local function attrs(values)
  local parts = {}
  for key, value in pairs(values) do
    if value ~= nil then
      parts[#parts + 1] = key .. '="' .. html_escape(value) .. '"'
    end
  end
  table.sort(parts)
  return #parts > 0 and (" " .. table.concat(parts, " ")) or ""
end

local function raw_block(tag, values)
  return pandoc.RawBlock("html", "<" .. tag .. attrs(values) .. ">")
end

local function raw_inline(tag, values)
  return "<" .. tag .. attrs(values) .. ">"
end

local function as_value(value)
  if value == nil or type(value) == "boolean" or type(value) == "string" then
    return value
  end
  if type(value) ~= "table" then
    return value
  end
  local value_type = pandoc.utils.type and pandoc.utils.type(value) or nil
  if value_type == "Inlines" or value_type == "Blocks" then
    return pandoc.utils.stringify(value)
  end
  if value_type == "List" then
    local list = {}
    for _, item in ipairs(value) do
      list[#list + 1] = as_value(item)
    end
    return list
  end
  if value_type == "Map" then
    local map = {}
    for key, item in pairs(value) do
      map[key] = as_value(item)
    end
    return map
  end
  if value.t == "MetaBool" or value.t == "MetaString" then
    return value.v
  end
  if value.t == "MetaInlines" or value.t == "MetaBlocks" then
    return pandoc.utils.stringify(value)
  end
  if value.t == "MetaList" then
    local list = {}
    for _, item in ipairs(value) do
      list[#list + 1] = as_value(item)
    end
    return list
  end
  if value.t == "MetaMap" then
    local map = {}
    for key, item in pairs(value) do
      map[key] = as_value(item)
    end
    return map
  end
  if value[1] ~= nil then
    return pandoc.utils.stringify(value)
  end
  local map = {}
  local has_key = false
  for key, item in pairs(value) do
    if type(key) ~= "number" then
      has_key = true
      map[key] = as_value(item)
    end
  end
  if has_key then
    return map
  end
  return value
end

local function check_attrs(actual, valid, id)
  for key in pairs(actual) do
    if not valid[key] and not key:match("^data%-") and key ~= "style" and key ~= "class" and key ~= "id" then
      warn(id, "unsupported attribute '" .. key .. "'")
    end
  end
end

local function check_bool(actual, name, id)
  local value = normalize_bool(actual[name])
  if not is_bool(value) then
    warn(id, "invalid boolean value for '" .. name .. "': '" .. value .. "'")
  end
end

local function check_bools(actual, id)
  for name in pairs(bool_attrs) do
    check_bool(actual, name, id)
  end
end

local function bool_option(actual, name)
  local value = normalize_bool(actual[name])
  if value ~= nil then
    return value == "true"
  end
  return options[name] == true or normalize_bool(options[name]) == "true"
end

local function string_option(actual, name)
  return actual[name] or options[name]
end

local function attr_or_empty(actual, name)
  return actual[name] or ""
end

local function validate_explanation(value, id)
  if value ~= "correct" and value ~= "after-check" and value ~= "never" then
    warn(id, "unsupported explanation policy '" .. tostring(value) .. "'")
    return defaults.explanation
  end
  return value
end

local function validate_option(value, allowed, default, id, name)
  if allowed[value] then
    return value
  end
  warn(id, "unsupported " .. name .. " '" .. tostring(value) .. "'")
  return default
end

local function split_values(value, delimiter)
  local out = {}
  local text = value or ""
  local item = {}
  local i = 1

  while i <= #text do
    local char = string.sub(text, i, i)
    local next_char = string.sub(text, i + 1, i + 1)

    if char == "\\" and (next_char == delimiter or next_char == "\\") then
      item[#item + 1] = next_char
      i = i + 2
    elseif char == delimiter then
      local value_part = table.concat(item)
      if value_part ~= "" then
        out[#out + 1] = value_part
      end
      item = {}
      i = i + 1
    else
      item[#item + 1] = char
      i = i + 1
    end
  end

  local value_part = table.concat(item)
  if value_part ~= "" then
    out[#out + 1] = value_part
  end

  return out
end

local function escape_delimited_value(value)
  return tostring(value or "")
    :gsub("\\", "\\\\")
    :gsub("|", "\\|")
end

local function join_values(values, delimiter)
  local escaped = {}
  for _, value in ipairs(values) do
    escaped[#escaped + 1] = escape_delimited_value(value)
  end
  return table.concat(escaped, delimiter)
end

local function has_inline_interaction(blocks)
  local found = false
  for _, block in ipairs(blocks) do
    if block.t == "CodeBlock" and block.classes:includes("code-cloze") then
      found = true
    else
      pandoc.walk_block(block, {
        Span = function(span)
          if span.classes:includes("blank") or span.classes:includes("choose") or
             span.classes:includes("quarto-exercise-blank-container") or
             span.classes:includes("quarto-exercise-choose-container") then
            found = true
          end
        end,
        Div = function(div)
          if div.classes:includes("quarto-exercise-code-cloze-container") then
            found = true
          end
          local cls = div.attributes and div.attributes["class"] or ""
          if type(cls) == "string" and (cls:find("quarto-exercise-code-cloze-container", 1, true) or
             cls:find("quarto-exercise-blank-container", 1, true) or
             cls:find("quarto-exercise-choose-container", 1, true)) then
            found = true
          end
        end,
        RawInline = function(raw)
          if raw.format == "html" and (raw.text:find("quarto-exercise-blank-container", 1, true) or
             raw.text:find("quarto-exercise-choose-container", 1, true) or
             raw.text:find("quarto-exercise-code-cloze-container", 1, true)) then
            found = true
          end
        end,
        RawBlock = function(raw)
          if raw.format == "html" and (raw.text:find("quarto-exercise-blank-container", 1, true) or
             raw.text:find("quarto-exercise-choose-container", 1, true) or
             raw.text:find("quarto-exercise-code-cloze-container", 1, true)) then
            found = true
          end
        end
      })
    end
  end
  return found
end

local function split_answer(block, id)
  local feedback
  local content = pandoc.List()
  local count = 0

  for _, child in ipairs(block.content) do
    if child.t == "Div" and child.classes:includes("feedback") then
      count = count + 1
      feedback = feedback or child
    else
      content:insert(child)
    end
  end

  if count > 1 then
    warn(id, "answer block has multiple feedback blocks")
  end
  if #content == 0 then
    warn(id, "answer block has no content")
  end

  if not feedback and block.attributes.feedback then
    feedback = pandoc.Div({ pandoc.Para({ block.attributes.feedback }) }, { class = "feedback" })
  end

  return content, feedback
end

local function parse_exercise(el, id, has_inline)
  local parsed = {
    stem = pandoc.List(),
    answers = {},
    explanation = nil,
    hint = nil,
    correct_count = 0
  }
  local keys_seen = {}

  for _, block in ipairs(el.content) do
    if block.t == "Div" and block.classes:includes("answer") then
      check_bool(block.attributes, "correct", id)
      local correct_value = normalize_bool(block.attributes.correct)
      local correct = is_bool(correct_value) and correct_value == "true"
      local key = block.attributes.key

      if correct then
        parsed.correct_count = parsed.correct_count + 1
      end
      if key and key ~= "" then
        if keys_seen[key] then
          warn(id, "duplicate answer key '" .. key .. "'")
        end
        keys_seen[key] = true
      end

      local content, feedback = split_answer(block, id)
      parsed.answers[#parsed.answers + 1] = {
        correct = correct,
        key = key,
        content = content,
        feedback = feedback
      }
    elseif block.t == "Div" and block.classes:includes("explanation") then
      if parsed.explanation then
        warn(id, "multiple explanation blocks inside one question")
      end
      parsed.explanation = block
    elseif block.t == "Div" and block.classes:includes("hint") then
      if parsed.hint then
        warn(id, "multiple hint blocks inside one question")
      end
      parsed.hint = block
    else
      parsed.stem:insert(block)
    end
  end

  for index, answer in ipairs(parsed.answers) do
    if not answer.key or answer.key == "" then
      answer.key = string.lower(alpha_key(index))
    end
  end

  if #parsed.answers == 0 and not has_inline and not has_inline_interaction(parsed.stem) and el.attributes["data-has-code-cloze"] ~= "true" then
    warn(id, "has no .answer blocks or inline blanks/choices")
  elseif #parsed.answers > 0 and parsed.correct_count == 0 then
    warn(id, "has no correct answers")
  end

  return parsed
end

local function render_html_exercise(data, id, exercise_options)
  local output = pandoc.List()
  output:insert(pandoc.RawBlock("html", get_key_script()))
  local input_type = data.correct_count > 1 and "checkbox" or "radio"

  local div_attrs = {
    class = "quarto-exercise" .. (exercise_options["question-boxes"] and " quarto-exercise-boxed" or ""),
    id = id,
    ["data-id"] = id,
    ["data-type"] = input_type,
    ["data-instant"] = exercise_options.instant,
    ["data-reveal"] = exercise_options.reveal,
    ["data-lock"] = exercise_options.lock,
    ["data-reset"] = exercise_options.reset,
    ["data-shuffle"] = exercise_options.shuffle,
    ["data-reshuffle-on-reset"] = exercise_options["reshuffle-on-reset"],
    ["data-explanation-policy"] = exercise_options.explanation,
    ["data-feedback-correct"] = exercise_options["feedback-correct"],
    ["data-feedback-incorrect"] = exercise_options["feedback-incorrect"],
    ["data-check-mode"] = exercise_options["check-mode"],
    ["data-score"] = exercise_options.score,
    ["data-points"] = exercise_options.points
  }
  for _, class in ipairs(exercise_options.classes or {}) do
    if class ~= "exercise" then
      div_attrs.class = div_attrs.class .. " " .. class
    end
  end
  for key, value in pairs(exercise_options.attributes or {}) do
    if (key:match("^data%-") or key == "style") and div_attrs[key] == nil then
      div_attrs[key] = value
    end
  end

  output:insert(raw_block("div", div_attrs))

  for _, block in ipairs(data.stem) do
    output:insert(block)
  end

  if #data.answers > 0 then
    output:insert(pandoc.RawBlock("html", '<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices quarto-exercise-choices-grid quarto-exercise-options-cols-' .. exercise_options["option-columns"] .. '" style="--ex-option-columns: ' .. exercise_options["option-columns"] .. ';">'))
    for _, answer in ipairs(data.answers) do
      local answer_key = answer.key
      local data_correct_attr = ' data-correct="' .. tostring(answer.correct) .. '"'
      local pba_attr = ""
      if options["obfuscate-answers"] then
        data_correct_attr = ''
        local res = protectAnswer({
          id = id,
          controlId = answer_key,
          kind = "mc",
          correct = answer.correct
        })
        pba_attr = ' data-pba="' .. res.payload .. '"'
      end
      local input_id = id .. "-" .. answer_key
      output:insert(pandoc.RawBlock("html",
        '<div class="quarto-exercise-answer" data-key="' .. html_escape(answer_key) .. '"' .. data_correct_attr .. pba_attr .. '>' ..
        '<div class="quarto-exercise-control">' ..
        '<input id="' .. html_escape(input_id) .. '" type="' .. input_type .. '" name="' .. html_escape(id) .. '" value="' .. html_escape(answer_key) .. '" class="quarto-exercise-input" />' ..
        '<label for="' .. html_escape(input_id) .. '" class="quarto-exercise-answer-label"></label>' ..
        '</div><div class="quarto-exercise-answer-content">'
      ))
      for _, block in ipairs(answer.content) do
        output:insert(block)
      end
      output:insert(pandoc.RawBlock("html", '</div><span class="quarto-exercise-answer-state quarto-exercise-sr-only"></span>'))
      if answer.feedback then
        output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-feedback" aria-live="polite" hidden>'))
        for _, block in ipairs(answer.feedback.content) do
          output:insert(block)
        end
        output:insert(pandoc.RawBlock("html", "</div>"))
      end
      output:insert(pandoc.RawBlock("html", "</div>"))
    end
    output:insert(pandoc.RawBlock("html", "</div></fieldset>"))
  end

  local button_class = " quarto-exercise-btn quarto-exercise-btn-primary"
  local reset_button_class = " quarto-exercise-btn quarto-exercise-btn-secondary"
  output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-actions">'))
  if not exercise_options.instant and not exercise_options.suppress_controls then
    output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-check-btn' .. button_class .. '">Check</button>'))
  end
  if exercise_options.reset and not exercise_options.suppress_controls then
    output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-reset-btn' .. reset_button_class .. '">Reset</button>'))
  end
  if data.hint then
    output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-hint-btn' .. reset_button_class .. '">Hint</button>'))
  end
  output:insert(pandoc.RawBlock("html", '<span class="quarto-exercise-status" aria-live="polite"></span></div>'))

  if data.hint then
    output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-hint" hidden aria-live="polite">'))
    for _, block in ipairs(data.hint.content) do
      output:insert(block)
    end
    output:insert(pandoc.RawBlock("html", "</div>"))
  end

  if data.explanation then
    output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-explanation" hidden aria-live="polite">'))
    for _, block in ipairs(data.explanation.content) do
      output:insert(block)
    end
    output:insert(pandoc.RawBlock("html", "</div>"))
  end

  output:insert(pandoc.RawBlock("html", "</div>"))
  return output
end

local function render_static_exercise(data)
  local output = pandoc.List()

  for _, block in ipairs(data.stem) do
    output:insert(block)
  end

  if #data.answers > 0 then
    local items = {}
    for index, answer in ipairs(data.answers) do
      local item = pandoc.List()
      local prefix = alpha_key(index) .. ". "
      local first = answer.content[1]

      if first and (first.t == "Para" or first.t == "Plain") then
        local inlines = pandoc.List({ pandoc.Str(prefix) })
        for _, inline in ipairs(first.content) do
          inlines:insert(inline)
        end
        item:insert(pandoc.Para(inlines))
        for i = 2, #answer.content do
          item:insert(answer.content[i])
        end
      else
        item:insert(pandoc.Para({ pandoc.Str(prefix) }))
        for _, block in ipairs(answer.content) do
          item:insert(block)
        end
      end
      items[#items + 1] = item
    end
    output:insert(pandoc.BulletList(items))
  end

  return output
end

local function parse_attributes(attr_str)
  local attrs = {}
  for k, v in string.gmatch(attr_str, '([%w%-]+)%s*=%s*"([^"]*)"') do
    attrs[k] = v
  end
  for k, v in string.gmatch(attr_str, "([%w%-]+)%s*=%s*'([^']*)'") do
    attrs[k] = v
  end
  for k, v in string.gmatch(attr_str, "([%w%-]+)%s*=%s*(%S+)") do
    if not attrs[k] then
      attrs[k] = v
    end
  end
  return attrs
end

json_encode = function(val)
  if type(val) == "string" then
    return '"' .. val:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r') .. '"'
  elseif type(val) == "boolean" then
    return tostring(val)
  elseif type(val) == "table" then
    local parts = {}
    if val[1] ~= nil then
      for _, item in ipairs(val) do
        parts[#parts + 1] = json_encode(item)
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      for k, v in pairs(val) do
        parts[#parts + 1] = json_encode(k) .. ":" .. json_encode(v)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  else
    return tostring(val)
  end
end

local function make_token(text, idx)
  while true do
    local token = string.format("QEXCLOZEP%06d", idx)
    if not string.find(text, token, 1, true) then
      return token
    end
    idx = idx + 1
  end
end
local function should_suppress_controls(parent_id, el_attributes)
  local check_page_active = options["check-page"] == true
  local in_batch = (el_attributes["data-in-batch"] == "true")
  return (parent_id ~= nil) or check_page_active or in_batch
end

local function process_code_cloze(el, parent_id)
  el.attributes["data-cloze-processed"] = nil
  local text = el.text
  local metadata = {}
  local static_answers = {}
  local count = 0
  local id = id_for(el, "cloze")

  local pos = 1
  while true do
    local start_pos = string.find(text, "{{", pos, true)
    if not start_pos then break end

    local end_pos = string.find(text, "}}", start_pos, true)
    if not end_pos then
      warn(id, "malformed cloze syntax: missing closing '}}'")
      break
    end

    local content = string.sub(text, start_pos + 2, end_pos - 1)
    local control_type = string.match(content, "^%s*(%a+)")
    if control_type ~= "blank" and control_type ~= "choose" then
      warn(id, "malformed cloze syntax: invalid control type '" .. tostring(control_type) .. "'")
    else
      local attrs_str = string.match(content, "^%s*%a+%s*(.-)%s*$")
      local attrs = parse_attributes(attrs_str)
      if control_type == "blank" then
        if not attrs.answer and not attrs.answers then
          warn(id, "blank with no answer")
        end
      elseif control_type == "choose" then
        if not attrs.answer then
          warn(id, "choose with no answer")
        end
        if not attrs.options then
          warn(id, "choose with no options")
        end
      end
    end
    pos = end_pos + 2
  end

  local html_text = text
  local static_text = text

  while true do
    local start_pos = string.find(html_text, "{{", 1, true)
    if not start_pos then break end
    local end_pos = string.find(html_text, "}}", start_pos, true)
    if not end_pos then break end

    local content = string.sub(html_text, start_pos + 2, end_pos - 1)
    local control_type, attrs_str = string.match(content, "^%s*(%a+)%s*(.-)%s*$")

    if control_type == "blank" or control_type == "choose" then
      count = count + 1
      local token = make_token(html_text, count)
      local attrs = parse_attributes(attrs_str)

      metadata[token] = {
        type = control_type,
        attrs = attrs
      }

      local ans = attrs.answer or attrs.answers or ""
      static_answers[#static_answers + 1] = ans

      html_text = string.sub(html_text, 1, start_pos - 1) .. token .. string.sub(html_text, end_pos + 2)
    else
      html_text = string.sub(html_text, 1, start_pos - 1) .. "INVALID_CLOZE" .. string.sub(html_text, end_pos + 2)
    end
  end

  while true do
    local start_pos = string.find(static_text, "{{", 1, true)
    if not start_pos then break end
    local end_pos = string.find(static_text, "}}", start_pos, true)
    if not end_pos then break end

    static_text = string.sub(static_text, 1, start_pos - 1) .. "________" .. string.sub(static_text, end_pos + 2)
  end

  if not html() then
    return pandoc.CodeBlock(static_text, el.attr)
  end

  el.text = html_text

  -- Replace the .code-cloze class with the actual language so Pandoc
  -- syntax-highlights the block. The lang= attribute is NOT how Pandoc
  -- selects a highlighter — the first matching class is.
  local lang = el.attributes["lang"] or ""
  el.classes = pandoc.List()
  if lang ~= "" then
    el.classes:insert(lang)
  end
  el.classes:insert("quarto-exercise-code-cloze-code")
  el.attributes["lang"] = nil
  local pba_payload = nil
  if options["obfuscate-answers"] then
    local res = protectAnswer({
      id = parent_id or id,
      controlId = id,
      kind = "cloze",
      metadata = metadata
    })
    pba_payload = res.payload
  end

  local classes = { "quarto-exercise-code-cloze-container" }
  if parent_id == nil then
    classes[#classes + 1] = "quarto-exercise-code-cloze-standalone"
  end

  local container_attrs = {
    class = table.concat(classes, " ")
  }
  local display_metadata = {}
  for token, info in pairs(metadata) do
    local attrs = {}
    for key, value in pairs(info.attrs) do
      if key ~= "answer" and key ~= "answers" and key ~= "match" and
         key ~= "ignore-case" and key ~= "trim" and key ~= "collapse-space" then
        attrs[key] = value
      end
    end
    display_metadata[token] = { type = info.type, attrs = attrs }
  end
  if pba_payload then
    container_attrs["data-pba"] = pba_payload
  end
  container_attrs["data-cloze-metadata"] = json_encode(options["obfuscate-answers"] and display_metadata or metadata)

  if parent_id then
    container_attrs["data-parent-id"] = parent_id
    container_attrs["data-id"] = id
  else
    container_attrs["id"] = id
    container_attrs["data-id"] = id
    container_attrs["data-points"] = string_option(el.attributes, "points")
  end

  local container = pandoc.Div({ el }, container_attrs)
  local prefix_html = get_key_script()

  if parent_id == nil then
    local suppress_controls = should_suppress_controls(nil, el.attributes)
    local actions_html = '<div class="quarto-exercise-actions">'
    if not suppress_controls then
      actions_html = actions_html ..
        '<button type="button" class="quarto-exercise-check-btn quarto-exercise-btn quarto-exercise-btn-primary">Check</button>' ..
        '<button type="button" class="quarto-exercise-reset-btn quarto-exercise-btn quarto-exercise-btn-secondary">Reset</button>'
    end
    actions_html = actions_html ..
      '<span class="quarto-exercise-status" aria-live="polite"></span>' ..
      '</div>'
    local actions = pandoc.RawBlock("html", actions_html)
    local wrapper = pandoc.Div({ container, actions }, { class = "quarto-exercise-code-cloze-wrapper" })
    if prefix_html ~= "" then
      return pandoc.List({ pandoc.RawBlock("html", prefix_html), wrapper })
    else
      return wrapper
    end
  else
    if prefix_html ~= "" then
      return pandoc.List({ pandoc.RawBlock("html", prefix_html), container })
    else
      return container
    end
  end
end

local function render_blank(el, id, parent_id)
  el.attributes["data-processed"] = nil
  check_attrs(el.attributes, blank_attrs, id)
  check_bools(el.attributes, id)

  local match = el.attributes.match or "exact"
  if match ~= "exact" and match ~= "one-of" and match ~= "regex" then
    warn(id, "unsupported blank matching mode '" .. match .. "'")
  end
  if el.attributes.answer and el.attributes.answers then
    warn(id, "both answer and answers on the same blank")
  end
  if not el.attributes.answer and not el.attributes.answers then
    warn(id, "blank with no answer")
  end
  if match == "regex" and not el.attributes.answer then
    warn(id, 'match="regex" with no answer')
  end

  local answer = el.attributes.answers or el.attributes.answer or ""
  if not html() then
    return pandoc.Str("________")
  end

  local container_attrs = {
    id = id,
    class = "quarto-exercise-blank-container",
    ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["data-feedback-incorrect"] = attr_or_empty(el.attributes, "feedback-incorrect")
  }
  if parent_id == nil then
    container_attrs["data-points"] = string_option(el.attributes, "points")
  end

  local ignore_case_val = (normalize_bool(el.attributes["ignore-case"]) or tostring(options["ignore-case"])) == "true"
  local trim_val = (el.attributes.trim or "true") ~= "false"
  local collapse_space_val = (normalize_bool(el.attributes["collapse-space"]) or tostring(options["collapse-space"])) == "true"

  if options["obfuscate-answers"] then
    local ans_list = split_values(answer, "|")
    local res = protectAnswer({
      id = parent_id or "default",
      controlId = id,
      kind = "blank",
      match = match,
      answers = ans_list,
      ignoreCase = ignore_case_val,
      trim = trim_val,
      collapseSpace = collapse_space_val
    })
    container_attrs["data-pba"] = res.payload
  else
    container_attrs["data-answers"] = answer
    container_attrs["data-match"] = match
    container_attrs["data-ignore-case"] = tostring(ignore_case_val)
    container_attrs["data-trim"] = tostring(trim_val)
    container_attrs["data-collapse-space"] = tostring(collapse_space_val)
  end

  local button_html = should_suppress_controls(parent_id, el.attributes) and "" or '<button type="button" class="quarto-exercise-blank-check-btn">Check</button>'

  local prefix = get_key_script()
  return pandoc.RawInline("html",
    prefix ..
    raw_inline("span", container_attrs) ..
    '<input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank" />' ..
    '<span class="quarto-exercise-blank-correct-text" hidden></span>' ..
    button_html ..
    '<span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>'
  )
end

local function render_choose(el, id, parent_id)
  el.attributes["data-processed"] = nil
  check_attrs(el.attributes, choose_attrs, id)
  check_bools(el.attributes, id)

  local answer = el.attributes.answer or ""
  if answer == "" then
    warn(id, "choose block with no answer")
  end

  local values = el.attributes.options and split_values(el.attributes.options, "|") or split_values(pandoc.utils.stringify(el), "|")
  if #values == 0 then
    warn(id, "choose block with no parseable options")
  end

  local ignore_case = normalize_bool(el.attributes["ignore-case"]) == "true"
  local found = answer == ""
  for _, value in ipairs(values) do
    if ignore_case and string.lower(value) == string.lower(answer) or value == answer then
      found = true
      break
    end
  end
  if not found then
    warn(id, "choose block whose answer '" .. answer .. "' is not in the options list")
  end

  if not html() then
    return pandoc.Str("________")
  end

  local container_attrs = {
    id = id,
    class = "quarto-exercise-choose-container",
    ["data-options"] = join_values(values, "|"),
    ["data-shuffle"] = normalize_bool(el.attributes.shuffle) or tostring(options.shuffle),
    ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["data-feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
  }
  if parent_id == nil then
    container_attrs["data-points"] = string_option(el.attributes, "points")
  end

  local ignore_case_val = (normalize_bool(el.attributes["ignore-case"]) or "false") == "true"

  if options["obfuscate-answers"] then
    local res = protectAnswer({
      id = parent_id or "default",
      controlId = id,
      kind = "choose",
      answer = answer,
      ignoreCase = ignore_case_val
    })
    container_attrs["data-pba"] = res.payload
  else
    container_attrs["data-answer"] = answer
    container_attrs["data-ignore-case"] = tostring(ignore_case_val)
  end

  local button_html = should_suppress_controls(parent_id, el.attributes) and "" or '<button type="button" class="quarto-exercise-choose-check-btn">Check</button>'

  local prefix = get_key_script()
  return pandoc.RawInline("html",
    prefix ..
    raw_inline("span", container_attrs) ..
    '<select class="quarto-exercise-choose-select"><option value="">Choose...</option></select>' ..
    '<span class="quarto-exercise-choose-correct-text" hidden></span>' ..
    button_html ..
    '<span class="quarto-exercise-choose-feedback" aria-live="polite" hidden></span></span>'
  )
end

function Meta(meta)
  if PANDOC_STATE and PANDOC_STATE.input_files and PANDOC_STATE.input_files[1] then
    doc_id = PANDOC_STATE.input_files[1]:gsub("\\", "/")
  elseif meta.title then
    doc_id = pandoc.utils.stringify(meta.title):gsub("\\", "/")
  end

  local config = as_value(meta["quarto-exercises"])
  if type(config) == "table" then
    for key, value in pairs(config) do
      options[key] = value
    end
    if config["option-columns"] ~= nil then
      warn("document", "'option-columns' is only supported on .exercise and .check-batch containers")
      options["option-columns"] = nil
    end
  end

  local check_page_val = meta["quarto-exercises.check-page"]
  if check_page_val == nil and type(config) == "table" then
    check_page_val = config["check-page"]
  end
  if check_page_val ~= nil then
    local norm = normalize_bool(as_value(check_page_val))
    options["check-page"] = norm == "true" or check_page_val == true
  else
    options["check-page"] = false
  end

  local obfuscate = true
  local override = meta["quarto-exercises.obfuscate-answers"]
  local val = nil
  if override ~= nil then
    val = normalize_bool(as_value(override))
    if val == "false" then
      obfuscate = false
    end
  end
  if obfuscate and options["obfuscate-answers"] ~= nil then
    local val = normalize_bool(options["obfuscate-answers"])
    if val == "false" or options["obfuscate-answers"] == false then
      obfuscate = false
    end
  end
  options["obfuscate-answers"] = obfuscate

  if obfuscate then
    local key = os.getenv("QUARTO_EXERCISES_KEY")
    if not key or key == "" then
      error("quarto-exercises error: 'obfuscate-answers' is enabled (default), but the build-time environment variable 'QUARTO_EXERCISES_KEY' is missing or empty. Please set 'QUARTO_EXERCISES_KEY' (for example: 'openssl rand -hex 32') or set 'obfuscate-answers: false' in your settings.")
    end
    options["_key"] = key
  end

  if quarto and quarto.doc and quarto.doc.add_html_dependency and html() then
    quarto.doc.add_html_dependency({
      name = "quarto-exercises",
      version = "0.1.0",
      stylesheets = { "quarto-exercises.css" },
      scripts = { "quarto-exercises.js" }
    })
  end

  return meta
end

function Div(el)
  if not el.classes:includes("exercise") then
    return nil
  end

  local id = id_for(el, "ex")
  check_attrs(el.attributes, exercise_attrs, id)
  check_bools(el.attributes, id)

  local has_inline = has_inline_interaction(el.content)
  local has_code_cloze = false
  el = el:walk({
    CodeBlock = function(code)
      if code.classes:includes("code-cloze") then
        has_code_cloze = true
        code.attributes["data-cloze-processed"] = "true"
        return process_code_cloze(code, id)
      end
    end,
    Span = function(span)
      if span.classes:includes("blank") then
        span.attributes["data-processed"] = "true"
        return render_blank(span, id_for(span, "blank"), id)
      elseif span.classes:includes("choose") then
        span.attributes["data-processed"] = "true"
        return render_choose(span, id_for(span, "choose"), id)
      end
    end
  })
  if has_code_cloze then
    el.attributes["data-has-code-cloze"] = "true"
  end

  local data = parse_exercise(el, id, has_inline)
  local explanation = validate_explanation(string_option(el.attributes, "explanation"), id)
  if data.explanation and explanation == "never" then
    warn(id, "contains an .explanation block, but explanation is set to 'never'")
  end
  if not html() then
    return render_static_exercise(data)
  end

  local check_page_active = options["check-page"] == true
  local is_in_batch = el.attributes["data-in-batch"] == "true"
  local runtime_check_mode = "exercise"
  if check_page_active then
    runtime_check_mode = "page"
  elseif is_in_batch then
    runtime_check_mode = "batch"
  end
  local suppress_controls = check_page_active or is_in_batch

  local cols_str = el.attributes["option-columns"]
  local cols_num = tonumber(cols_str)
  local option_cols = 1
  if cols_num and cols_num >= 1 then
    option_cols = math.floor(cols_num)
  elseif cols_str ~= nil and cols_str ~= "" then
    warn(id, "unsupported option-columns '" .. cols_str .. "', falling back to 1")
  end

  return render_html_exercise(data, id, {
    instant = bool_option(el.attributes, "instant"),
    reveal = bool_option(el.attributes, "reveal"),
    lock = bool_option(el.attributes, "lock"),
    reset = bool_option(el.attributes, "reset"),
    shuffle = bool_option(el.attributes, "shuffle"),
    ["reshuffle-on-reset"] = bool_option(el.attributes, "reshuffle-on-reset"),
    explanation = explanation,
    ["feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect"),
    ["question-boxes"] = bool_option(el.attributes, "question-boxes"),
    ["option-columns"] = option_cols,
    ["check-mode"] = runtime_check_mode,
    score = bool_option(el.attributes, "score"),
    points = tonumber(el.attributes.points or options.points) or defaults.points,
    suppress_controls = suppress_controls,
    classes = el.classes,
    attributes = el.attributes
  })
end

function CodeBlock(el)
  if not el.classes:includes("code-cloze") then
    return nil
  end
  if el.attributes["data-cloze-processed"] == "true" then
    el.attributes["data-cloze-processed"] = nil
    return el
  end
  return process_code_cloze(el, nil)
end

function Span(el)
  if el.attributes["data-processed"] == "true" then
    return nil
  end
  if el.classes:includes("blank") then
    return render_blank(el, id_for(el, "blank"), nil)
  end
  if el.classes:includes("choose") then
    return render_choose(el, id_for(el, "choose"), nil)
  end
  return nil
end

local function mark_batch_exercises(el)
  if el.classes:includes("check-batch") then
    local cols_str = el.attributes["option-columns"]
    if cols_str ~= nil then
      local cols_num = tonumber(cols_str)
      if cols_num and cols_num >= 1 then
        local cols = math.floor(cols_num)
        el.classes:insert("quarto-exercise-batch-grid")
        local grid_style = "--ex-batch-columns: " .. cols .. ";"
        if el.attributes.style and el.attributes.style ~= "" then
          local separator = el.attributes.style:match(";%s*$") and " " or "; "
          el.attributes.style = el.attributes.style .. separator .. grid_style
        else
          el.attributes.style = grid_style
        end
      else
        warn(id_for(el, "batch"), "unsupported option-columns '" .. tostring(cols_str) .. "', using one column")
      end
      el.attributes["option-columns"] = nil
    end
    local qb_option = el.attributes["question-boxes"]
    local question_boxes_active = false
    if qb_option ~= nil then
      question_boxes_active = qb_option == "true"
    else
      question_boxes_active = options["question-boxes"] == true
    end
    if question_boxes_active then
      el.classes:insert("quarto-exercise-boxed")
    end

    el = el:walk({
      Div = function(sub_div)
        if sub_div.classes:includes("exercise") then
          sub_div.attributes["data-in-batch"] = "true"
          if question_boxes_active then
            sub_div.attributes["question-boxes"] = "false"
          end
          return sub_div
        end
      end,
      Span = function(span)
        if span.classes:includes("blank") or span.classes:includes("choose") then
          span.attributes["data-in-batch"] = "true"
          return span
        end
      end,
      CodeBlock = function(code)
        if code.classes:includes("code-cloze") then
          code.attributes["data-in-batch"] = "true"
          return code
        end
      end
    })
    return el
  end
end

return {
  { Meta = Meta },
  { Div = mark_batch_exercises },
  { Div = Div },
  { Span = Span, CodeBlock = CodeBlock }
}
