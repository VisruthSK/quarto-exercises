local defaults = {
  instant = false,
  reveal = false,
  lock = false,
  reset = true,
  shuffle = false,
  ["reshuffle-on-reset"] = false,
  ["show-answers"] = false,
  explanation = "correct",
  ["feedback-correct"] = "Correct!",
  ["feedback-incorrect"] = "Not quite.",
  ["ignore-case"] = false
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
  ["feedback-incorrect"] = true
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
  ["feedback-incorrect"] = true
}

local choose_attrs = {
  id = true,
  class = true,
  answer = true,
  options = true,
  ["ignore-case"] = true,
  shuffle = true,
  ["feedback-correct"] = true,
  ["feedback-incorrect"] = true
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
  ["collapse-space"] = true
}

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
    if not valid[key] then
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
          if span.classes:includes("blank") or span.classes:includes("choose") then
            found = true
          end
        end,
        Div = function(div)
          if div.classes:includes("quarto-exercise-code-cloze-container") then
            found = true
          end
          local cls = div.attributes and div.attributes["class"] or ""
          if type(cls) == "string" and cls:find("quarto-exercise-code-cloze-container", 1, true) then
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

  return content, feedback
end

local function parse_exercise(el, id)
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

  if #parsed.answers == 0 and not has_inline_interaction(parsed.stem) and el.attributes["data-has-code-cloze"] ~= "true" then
    warn(id, "has no .answer blocks or inline blanks/choices")
  elseif #parsed.answers > 0 and parsed.correct_count == 0 then
    warn(id, "has no correct answers")
  end

  return parsed
end

local function render_html_exercise(data, id, exercise_options, user_classes)
  local output = pandoc.List()
  local input_type = data.correct_count > 1 and "checkbox" or "radio"

  local classes = { "quarto-exercise" }
  if user_classes then
    for _, c in ipairs(user_classes) do
      if c ~= "exercise" then
        classes[#classes + 1] = c
      end
    end
  end

  output:insert(raw_block("div", {
    class = table.concat(classes, " "),
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
    ["data-feedback-incorrect"] = exercise_options["feedback-incorrect"]
  }))

  for _, block in ipairs(data.stem) do
    output:insert(block)
  end

  if #data.answers > 0 then
    output:insert(pandoc.RawBlock("html", '<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">'))
    for _, answer in ipairs(data.answers) do
      local input_id = id .. "-" .. answer.key
      output:insert(pandoc.RawBlock("html",
        '<div class="quarto-exercise-answer" data-key="' .. html_escape(answer.key) .. '" data-correct="' .. tostring(answer.correct) .. '">' ..
        '<div class="quarto-exercise-control">' ..
        '<input id="' .. html_escape(input_id) .. '" type="' .. input_type .. '" name="' .. html_escape(id) .. '" value="' .. html_escape(answer.key) .. '" class="quarto-exercise-input" />' ..
        '<label for="' .. html_escape(input_id) .. '" class="quarto-exercise-answer-label"></label>' ..
        '</div><div class="quarto-exercise-answer-content">'
      ))
      for _, block in ipairs(answer.content) do
        output:insert(block)
      end
      output:insert(pandoc.RawBlock("html", "</div>"))
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

  output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-actions">'))
  if not exercise_options.instant then
    output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-check-btn">Check</button>'))
  end
  if exercise_options.reset then
    output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-reset-btn">Reset</button>'))
  end
  if data.hint then
    output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-hint-btn">Hint</button>'))
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

  if options["show-answers"] then
    local correct = {}
    for index, answer in ipairs(data.answers) do
      if answer.correct then
        correct[#correct + 1] = alpha_key(index)
      end
    end
    if #correct > 0 then
      output:insert(pandoc.Para({ pandoc.Strong({ pandoc.Str("Answer: " .. table.concat(correct, ", ")) }) }))
    end
    if data.explanation then
      output:insert(data.explanation)
    end
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

local function json_encode(val)
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

local function process_code_cloze(el, parent_id)
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
    local new_code = pandoc.CodeBlock(static_text, el.attr)
    if options["show-answers"] and #static_answers > 0 then
      local ans_list = {}
      for idx, ans in ipairs(static_answers) do
        ans_list[#ans_list + 1] = tostring(idx) .. ". " .. ans
      end
      local ans_para = pandoc.Para({ pandoc.Strong({ pandoc.Str("Answer: " .. table.concat(ans_list, ", ")) }) })
      return pandoc.List({ new_code, ans_para })
    else
      return new_code
    end
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
  el.attributes["data-cloze-processed"] = nil

  local meta_json = json_encode(metadata)
  local classes = { "quarto-exercise-code-cloze-container" }
  if parent_id == nil then
    classes[#classes + 1] = "quarto-exercise-code-cloze-standalone"
  end

  local container_attrs = {
    class = table.concat(classes, " "),
    ["data-cloze-metadata"] = meta_json
  }

  if parent_id then
    container_attrs["data-parent-id"] = parent_id
  else
    container_attrs["id"] = id
    container_attrs["data-id"] = id
  end

  local container = pandoc.Div({ el }, container_attrs)

  if parent_id == nil then
    local actions = pandoc.RawBlock("html",
      '<div class="quarto-exercise-actions">' ..
      '<button type="button" class="quarto-exercise-check-btn">Check</button>' ..
      '<button type="button" class="quarto-exercise-reset-btn">Reset</button>' ..
      '<span class="quarto-exercise-status" aria-live="polite"></span>' ..
      '</div>'
    )
    return pandoc.Div({ container, actions }, { class = "quarto-exercise-code-cloze-wrapper" })
  else
    return container
  end
end

local function render_blank(el, id)
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
    return options["show-answers"] and pandoc.Underline({ pandoc.Str(answer) }) or pandoc.Str("________")
  end

  local classes = { "quarto-exercise-blank-container" }
  for _, c in ipairs(el.classes) do
    if c ~= "blank" then
      classes[#classes + 1] = c
    end
  end

  local container_attrs = {
    class = table.concat(classes, " "),
    ["data-answers"] = answer,
    ["data-match"] = match,
    ["data-ignore-case"] = normalize_bool(el.attributes["ignore-case"]) or tostring(options["ignore-case"]),
    ["data-trim"] = el.attributes.trim or "true",
    ["data-collapse-space"] = el.attributes["collapse-space"] or "false",
    ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["data-feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
  }
  if el.identifier and el.identifier ~= "" then
    container_attrs.id = el.identifier
  end

  return pandoc.RawInline("html",
    raw_inline("span", container_attrs) ..
    '<input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank" />' ..
    '<span class="quarto-exercise-blank-correct-text" hidden></span>' ..
    '<button type="button" class="quarto-exercise-blank-check-btn">Check</button>' ..
    '<span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>'
  )
end

local function render_choose(el, id)
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
    return options["show-answers"] and pandoc.Underline({ pandoc.Str(answer) }) or pandoc.Str("________")
  end

  local classes = { "quarto-exercise-choose-container" }
  for _, c in ipairs(el.classes) do
    if c ~= "choose" then
      classes[#classes + 1] = c
    end
  end

  local container_attrs = {
    class = table.concat(classes, " "),
    ["data-answer"] = answer,
    ["data-options"] = join_values(values, "|"),
    ["data-shuffle"] = normalize_bool(el.attributes.shuffle) or tostring(options.shuffle),
    ["data-ignore-case"] = normalize_bool(el.attributes["ignore-case"]) or "false",
    ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["data-feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
  }
  if el.identifier and el.identifier ~= "" then
    container_attrs.id = el.identifier
  end

  return pandoc.RawInline("html",
    raw_inline("span", container_attrs) ..
    '<select class="quarto-exercise-choose-select"><option value="">Choose...</option></select>' ..
    '<span class="quarto-exercise-choose-correct-text" hidden></span>' ..
    '<button type="button" class="quarto-exercise-choose-check-btn">Check</button>' ..
    '<span class="quarto-exercise-choose-feedback" aria-live="polite" hidden></span></span>'
  )
end

function Meta(meta)
  local config = as_value(meta["quarto-exercises"])
  if type(config) == "table" then
    for key, value in pairs(config) do
      options[key] = value
    end
  end

  if quarto and quarto.doc and quarto.doc.add_html_dependency and html() then
    quarto.doc.add_html_dependency({
      name = "quarto-exercises",
      version = "1.0.0",
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

  local has_code_cloze = false
  el = el:walk({
    CodeBlock = function(code)
      if code.classes:includes("code-cloze") then
        has_code_cloze = true
        code.attributes["data-cloze-processed"] = "true"
        return process_code_cloze(code, id)
      end
    end
  })
  if has_code_cloze then
    el.attributes["data-has-code-cloze"] = "true"
  end

  local data = parse_exercise(el, id)
  if not html() then
    return render_static_exercise(data)
  end

  return render_html_exercise(data, id, {
    instant = bool_option(el.attributes, "instant"),
    reveal = bool_option(el.attributes, "reveal"),
    lock = bool_option(el.attributes, "lock"),
    reset = bool_option(el.attributes, "reset"),
    shuffle = bool_option(el.attributes, "shuffle"),
    ["reshuffle-on-reset"] = bool_option(el.attributes, "reshuffle-on-reset"),
    explanation = validate_explanation(string_option(el.attributes, "explanation"), id),
    ["feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
  }, el.classes)
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
  if el.classes:includes("blank") then
    return render_blank(el, id_for(el, "blank"))
  end
  if el.classes:includes("choose") then
    return render_choose(el, id_for(el, "choose"))
  end
  return nil
end

return {
  { Meta = Meta },
  { Div = Div },
  { Span = Span, CodeBlock = CodeBlock }
}
