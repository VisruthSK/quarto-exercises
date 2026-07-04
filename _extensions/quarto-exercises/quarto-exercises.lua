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
  local key = alphabet[((index - 1) % #alphabet) + 1]
  if index > #alphabet then
    key = key .. tostring(math.floor((index - 1) / #alphabet))
  end
  return key
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
  local value = actual[name]
  if value ~= nil and value ~= "" and value ~= "true" and value ~= "false" then
    warn(id, "invalid boolean value for '" .. name .. "': '" .. value .. "'")
  end
end

local function check_bools(actual, id)
  for name in pairs(bool_attrs) do
    check_bool(actual, name, id)
  end
end

local function bool_option(actual, name)
  if actual[name] ~= nil then
    return actual[name] == "true"
  end
  return options[name] == true
end

local function string_option(actual, name)
  return actual[name] or options[name]
end

local function split_values(value, delimiter)
  local out = {}
  for item in string.gmatch(value or "", "([^" .. delimiter .. "]+)") do
    out[#out + 1] = item:gsub("^%s*(.-)%s*$", "%1")
  end
  return out
end

local function has_inline_interaction(blocks)
  local found = false
  for _, block in ipairs(blocks) do
    pandoc.walk_block(block, {
      Span = function(span)
        if span.classes:includes("blank") or span.classes:includes("choose") then
          found = true
        end
      end
    })
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
      local correct = block.attributes.correct == "true"
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

  if #parsed.answers == 0 and not has_inline_interaction(parsed.stem) then
    warn(id, "has no .answer blocks or inline blanks/choices")
  elseif #parsed.answers > 0 and parsed.correct_count == 0 then
    warn(id, "has no correct answers")
  end

  return parsed
end

local function render_html_exercise(data, id, exercise_options)
  local output = pandoc.List()
  local input_type = data.correct_count > 1 and "checkbox" or "radio"

  output:insert(raw_block("div", {
    class = "quarto-exercise",
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
      output:insert(pandoc.RawBlock("html",
        '<div class="quarto-exercise-answer" data-key="' .. html_escape(answer.key) .. '" data-correct="' .. tostring(answer.correct) .. '">' ..
        '<label class="quarto-exercise-label"><input type="' .. input_type .. '" name="' .. html_escape(id) .. '" value="' .. html_escape(answer.key) .. '" class="quarto-exercise-input" />' ..
        '<span class="quarto-exercise-answer-label"></span><span class="quarto-exercise-answer-content">'
      ))
      for _, block in ipairs(answer.content) do
        output:insert(block)
      end
      output:insert(pandoc.RawBlock("html", '</span></label>'))
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
  return pandoc.Div(output)
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

  return pandoc.Div(output)
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
  if match == "regex" and not el.attributes.answer then
    warn(id, 'match="regex" with no answer')
  end

  local answer = el.attributes.answers or el.attributes.answer or ""
  if not html() then
    return options["show-answers"] and pandoc.Underline({ pandoc.Str(answer) }) or pandoc.Str("________")
  end

  return pandoc.RawInline("html",
    raw_inline("span", {
      class = "quarto-exercise-blank-container",
      ["data-answers"] = answer,
      ["data-match"] = match,
      ["data-ignore-case"] = el.attributes["ignore-case"] or tostring(options["ignore-case"]),
      ["data-trim"] = el.attributes.trim or "true",
      ["data-collapse-space"] = el.attributes["collapse-space"] or "false",
      ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
      ["data-feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
    }) ..
    '<input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank" />' ..
    '<span class="quarto-exercise-blank-correct-text" hidden></span>' ..
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

  local values = el.attributes.options and split_values(el.attributes.options, ",") or split_values(pandoc.utils.stringify(el), "/")
  if #values == 0 then
    warn(id, "choose block with no parseable options")
  end

  local ignore_case = el.attributes["ignore-case"] == "true"
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

  return pandoc.RawInline("html",
    raw_inline("span", {
      class = "quarto-exercise-choose-container",
      ["data-answer"] = answer,
      ["data-options"] = table.concat(values, ","),
      ["data-shuffle"] = el.attributes.shuffle or tostring(options.shuffle),
      ["data-ignore-case"] = el.attributes["ignore-case"] or "false",
      ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
      ["data-feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
    }) ..
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
    explanation = string_option(el.attributes, "explanation"),
    ["feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
  })
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
  { Span = Span }
}
