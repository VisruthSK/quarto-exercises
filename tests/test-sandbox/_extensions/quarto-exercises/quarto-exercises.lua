-- quarto-exercises.lua
-- Lua filter for quarto-exercises extension

local doc_options = {
  instant = false,
  reveal = false,
  lock = false,
  reset = true,
  shuffle = false,
  ["reshuffle-on-reset"] = false,
  ["show-answers"] = false,
  explanation = "correct",
  ["feedback-correct"] = "Correct!",
  ["feedback-incorrect"] = "Not quite."
}

-- Helper to convert Pandoc Meta objects to standard Lua values
local function meta_to_val(meta_val)
  if meta_val == nil then return nil end
  if type(meta_val) == "boolean" then return meta_val end
  if type(meta_val) == "string" then return meta_val end
  if type(meta_val) == "table" then
    if meta_val.t == "MetaBool" then
      return meta_val.v
    elseif meta_val.t == "MetaString" then
      return meta_val.v
    elseif meta_val.t == "MetaInlines" then
      return pandoc.utils.stringify(meta_val)
    elseif meta_val.t == "MetaBlocks" then
      return pandoc.utils.stringify(meta_val)
    elseif meta_val.t == "MetaList" then
      local list = {}
      for i, v in ipairs(meta_val) do
        table.insert(list, meta_to_val(v))
      end
      return list
    elseif meta_val.t == "MetaMap" then
      local map = {}
      for k, v in pairs(meta_val) do
        map[k] = meta_to_val(v)
      end
      return map
    end
  end
  return meta_val
end

-- Warning function
local function warn(msg, id)
  local prefix = "quarto-exercises warning: "
  if id and id ~= "" then
    prefix = prefix .. "exercise: #" .. id .. " "
  else
    prefix = prefix .. "exercise: "
  end
  io.stderr:write(prefix .. msg .. "\n")
end

-- Validate boolean attributes
local function validate_bool(val, attr_name, id)
  if val ~= nil and val ~= "" and val ~= "true" and val ~= "false" then
    warn("invalid boolean value for '" .. attr_name .. "': '" .. val .. "'", id)
    return false
  end
  return true
end

-- Check for unsupported attributes
local function check_unsupported_attrs(attrs, valid_set, id)
  for k, _ in pairs(attrs) do
    if not valid_set[k] then
      warn("unsupported attribute '" .. k .. "'", id)
    end
  end
end

-- Metadata parsing
function Meta(meta)
  local q_ex = meta['quarto-exercises']
  if q_ex then
    local parsed = meta_to_val(q_ex)
    if type(parsed) == "table" then
      for k, v in pairs(parsed) do
        doc_options[k] = v
      end
    end
  end

  if quarto and quarto.doc and quarto.doc.add_html_dependency then
    if FORMAT:match("html") then
      quarto.doc.add_html_dependency({
        name = "quarto-exercises",
        version = "1.0.0",
        stylesheets = {"quarto-exercises.css"},
        scripts = {"quarto-exercises.js"}
      })
    end
  end
  return meta
end

-- Helper to generate unique ID
local exercise_counter = 0
local function get_unique_id(prefix)
  exercise_counter = exercise_counter + 1
  return prefix .. "-" .. exercise_counter
end

-- Parse and process Div elements (.exercise)
function Div(el)
  if not el.classes:includes("exercise") then
    return nil
  end

  local id = el.identifier
  if id == "" then
    id = get_unique_id("ex")
  end

  -- Validate attributes
  local valid_exercise_attrs = {
    id = true, class = true, shuffle = true, ["reshuffle-on-reset"] = true,
    instant = true, reveal = true, lock = true, reset = true,
    explanation = true, ["feedback-correct"] = true, ["feedback-incorrect"] = true
  }
  check_unsupported_attrs(el.attributes, valid_exercise_attrs, id)

  validate_bool(el.attributes["shuffle"], "shuffle", id)
  validate_bool(el.attributes["reshuffle-on-reset"], "reshuffle-on-reset", id)
  validate_bool(el.attributes["instant"], "instant", id)
  validate_bool(el.attributes["reveal"], "reveal", id)
  validate_bool(el.attributes["lock"], "lock", id)
  validate_bool(el.attributes["reset"], "reset", id)

  -- Resolve configuration values (local overrides global)
  local opt_shuffle = el.attributes["shuffle"] ~= nil and el.attributes["shuffle"] == "true" or (el.attributes["shuffle"] == nil and doc_options.shuffle)
  local opt_reshuffle = el.attributes["reshuffle-on-reset"] ~= nil and el.attributes["reshuffle-on-reset"] == "true" or (el.attributes["reshuffle-on-reset"] == nil and doc_options["reshuffle-on-reset"])
  local opt_instant = el.attributes["instant"] ~= nil and el.attributes["instant"] == "true" or (el.attributes["instant"] == nil and doc_options.instant)
  local opt_reveal = el.attributes["reveal"] ~= nil and el.attributes["reveal"] == "true" or (el.attributes["reveal"] == nil and doc_options.reveal)
  local opt_lock = el.attributes["lock"] ~= nil and el.attributes["lock"] == "true" or (el.attributes["lock"] == nil and doc_options.lock)
  local opt_reset = el.attributes["reset"] ~= "false" and doc_options.reset
  if el.attributes["reset"] == "false" then opt_reset = false end
  
  local opt_explanation = el.attributes["explanation"] or doc_options.explanation
  local opt_feedback_correct = el.attributes["feedback-correct"] or doc_options["feedback-correct"]
  local opt_feedback_incorrect = el.attributes["feedback-incorrect"] or doc_options["feedback-incorrect"]

  -- Extract content components
  local answers = {}
  local explanation = nil
  local hint = nil
  local question_stem = pandoc.List()
  local correct_count = 0
  local has_answers = false
  local keys_seen = {}

  for _, block in ipairs(el.content) do
    if block.t == "Div" and block.classes:includes("answer") then
      has_answers = true
      validate_bool(block.attributes["correct"], "correct", id)
      
      local correct = block.attributes["correct"] == "true"
      if correct then
        correct_count = correct_count + 1
      end

      local key = block.attributes["key"]
      if key and key ~= "" then
        if keys_seen[key] then
          warn("duplicate answer key '" .. key .. "'", id)
        end
        keys_seen[key] = true
      end

      -- Extract custom feedback block
      local feedbacks = {}
      local answer_content = pandoc.List()
      for _, sub_block in ipairs(block.content) do
        if sub_block.t == "Div" and sub_block.classes:includes("feedback") then
          table.insert(feedbacks, sub_block)
        else
          table.insert(answer_content, sub_block)
        end
      end

      if #feedbacks > 1 then
        warn("answer block has multiple feedback blocks", id)
      elseif #feedbacks == 1 and feedbacks[1].content and #feedbacks[1].content == 0 then
        -- feedback with empty contents is okay but check answer empty
      end

      if #answer_content == 0 then
        warn("answer block has no content", id)
      end

      table.insert(answers, {
        correct = correct,
        key = key,
        content = answer_content,
        feedback = feedbacks[1]
      })

    elseif block.t == "Div" and block.classes:includes("explanation") then
      if explanation then
        warn("multiple explanation blocks inside one question", id)
      end
      explanation = block
    elseif block.t == "Div" and block.classes:includes("hint") then
      if hint then
        warn("multiple hint blocks inside one question", id)
      end
      hint = block
    else
      table.insert(question_stem, block)
    end
  end

  -- Determine if there are inline interactions in the stem
  local has_inlines = false
  for _, b in ipairs(question_stem) do
    pandoc.walk_block(b, {
      Span = function(span)
        if span.classes:includes("blank") or span.classes:includes("choose") then
          has_inlines = true
        end
      end
    })
  end

  -- Validation warnings
  if not has_answers and not has_inlines then
    warn("has no .answer blocks or inline blanks/choices", id)
  elseif has_answers and correct_count == 0 then
    warn("has no correct answers", id)
  end

  -- Assign keys to answers if omitted
  local alphabet = {"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"}
  for idx, ans in ipairs(answers) do
    if not ans.key or ans.key == "" then
      local auto_key = string.lower(alphabet[((idx - 1) % 26) + 1])
      if idx > 26 then
        auto_key = auto_key .. tostring(math.floor((idx - 1) / 26))
      end
      ans.key = auto_key
    end
  end

  local is_html = FORMAT:match("html")
  if is_html then
    -- Generate HTML Output
    local output = pandoc.List()
    
    -- Wrapper attributes
    local input_type = "radio"
    if correct_count > 1 then
      input_type = "checkbox"
    end

    local opt_feedback_correct = el.attributes["feedback-correct"] or doc_options["feedback-correct"]
    local opt_feedback_incorrect = el.attributes["feedback-incorrect"] or doc_options["feedback-incorrect"]

    -- Construct wrapper Div
    local wrapper_attrs = {
      class = "quarto-exercise",
      id = id,
      ["data-id"] = id,
      ["data-type"] = input_type,
      ["data-instant"] = tostring(opt_instant),
      ["data-reveal"] = tostring(opt_reveal),
      ["data-lock"] = tostring(opt_lock),
      ["data-reset"] = tostring(opt_reset),
      ["data-shuffle"] = tostring(opt_shuffle),
      ["data-reshuffle-on-reset"] = tostring(opt_reshuffle),
      ["data-explanation-policy"] = opt_explanation,
      ["data-feedback-correct"] = opt_feedback_correct,
      ["data-feedback-incorrect"] = opt_feedback_incorrect
    }

    -- Output the starting tag
    local attr_str = ""
    for k, v in pairs(wrapper_attrs) do
      attr_str = attr_str .. " " .. k .. '="' .. v .. '"'
    end
    output:insert(pandoc.RawBlock("html", "<div" .. attr_str .. ">"))

    -- Render the question stem
    for _, b in ipairs(question_stem) do
      output:insert(b)
    end

    -- Render the answers group if any
    if #answers > 0 then
      output:insert(pandoc.RawBlock("html", '<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">'))

      for idx, ans in ipairs(answers) do
        local is_correct_str = tostring(ans.correct)
        output:insert(pandoc.RawBlock("html", string.format(
          '<div class="quarto-exercise-answer" data-key="%s" data-correct="%s"><label class="quarto-exercise-label"><input type="%s" name="%s" value="%s" class="quarto-exercise-input" /><span class="quarto-exercise-answer-label"></span><span class="quarto-exercise-answer-content">',
          ans.key, is_correct_str, input_type, id, ans.key
        )))
        
        -- Insert answer content block(s)
        for _, b in ipairs(ans.content) do
          output:insert(b)
        end

        output:insert(pandoc.RawBlock("html", '</span></label>'))

        if ans.feedback then
          output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-feedback" aria-live="polite" style="display: none;">'))
          output:insert(ans.feedback)
          output:insert(pandoc.RawBlock("html", '</div>'))
        end
        output:insert(pandoc.RawBlock("html", '</div>'))
      end

      output:insert(pandoc.RawBlock("html", '</div></fieldset>'))
    end

    -- Add Check and Reset buttons
    output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-actions">'))
    if not opt_instant then
      output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-check-btn">Check</button>'))
    end
    if opt_reset then
      output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-reset-btn">Reset</button>'))
    end
    if hint then
      output:insert(pandoc.RawBlock("html", '<button type="button" class="quarto-exercise-hint-btn">Hint</button>'))
    end
    output:insert(pandoc.RawBlock("html", '<span class="quarto-exercise-status" aria-live="polite"></span></div>'))

    -- Render the question-level hint block
    if hint then
      output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-hint" style="display: none;" aria-live="polite">'))
      output:insert(hint)
      output:insert(pandoc.RawBlock("html", '</div>'))
    end

    -- Render the question-level explanation block
    if explanation then
      output:insert(pandoc.RawBlock("html", '<div class="quarto-exercise-explanation" style="display: none;" aria-live="polite">'))
      output:insert(explanation)
      output:insert(pandoc.RawBlock("html", '</div>'))
    end

    -- Close wrapper Div
    output:insert(pandoc.RawBlock("html", "</div>"))

    return pandoc.Div(output)
  else
    -- Non-HTML Output Fallback (PDF, Word, etc.)
    local output = pandoc.List()
    for _, b in ipairs(question_stem) do
      output:insert(b)
    end

    if #answers > 0 then
      local items = {}
      for idx, ans in ipairs(answers) do
        local prefix = alphabet[((idx - 1) % 26) + 1] .. ". "
        local item_content = pandoc.List()
        -- Add the letter prefix to the first block in the answer content
        if #ans.content > 0 then
          local first = ans.content[1]
          if first.t == "Para" or first.t == "Plain" then
            local new_inlines = pandoc.List({pandoc.Str(prefix)})
            for _, inline in ipairs(first.content) do
              new_inlines:insert(inline)
            end
            item_content:insert(pandoc.Para(new_inlines))
            for i = 2, #ans.content do
              item_content:insert(ans.content[i])
            end
          else
            item_content:insert(pandoc.Para({pandoc.Str(prefix)}))
            for _, b in ipairs(ans.content) do
              item_content:insert(b)
            end
          end
        else
          item_content:insert(pandoc.Para({pandoc.Str(prefix)}))
        end
        table.insert(items, item_content)
      end
      output:insert(pandoc.BulletList(items))
    end

    -- Include answer keys if show-answers is set to true globally
    if doc_options["show-answers"] then
      local correct_keys = {}
      for idx, ans in ipairs(answers) do
        if ans.correct then
          table.insert(correct_keys, alphabet[((idx - 1) % 26) + 1])
        end
      end
      if #correct_keys > 0 then
        output:insert(pandoc.Para({pandoc.Strong({pandoc.Str("Answer: " .. table.concat(correct_keys, ", "))})}))
      end
      if explanation then
        output:insert(explanation)
      end
    end

    return pandoc.Div(output)
  end
end

-- Parse and process Span elements (.blank and .choose)
function Span(el)
  if el.classes:includes("blank") then
    local id = el.identifier
    if id == "" then id = get_unique_id("blank") end

    local valid_blank_attrs = {
      id = true, class = true, answer = true, answers = true, match = true,
      ["ignore-case"] = true, trim = true, ["collapse-space"] = true,
      ["feedback-correct"] = true, ["feedback-incorrect"] = true
    }
    check_unsupported_attrs(el.attributes, valid_blank_attrs, id)

    validate_bool(el.attributes["ignore-case"], "ignore-case", id)
    validate_bool(el.attributes["trim"], "trim", id)
    validate_bool(el.attributes["collapse-space"], "collapse-space", id)

    local val_match = el.attributes["match"] or "exact"
    if val_match ~= "exact" and val_match ~= "one-of" and val_match ~= "regex" then
      warn("unsupported blank matching mode '" .. val_match .. "'", id)
    end

    local answer = el.attributes["answer"]
    local answers = el.attributes["answers"]

    if answer and answers then
      warn("both answer and answers on the same blank", id)
    end

    if val_match == "regex" and not answer then
      warn("match=\"regex\" with no answer", id)
    end

    local opt_feedback_correct = el.attributes["feedback-correct"] or doc_options["feedback-correct"]
    local opt_feedback_incorrect = el.attributes["feedback-incorrect"] or doc_options["feedback-incorrect"]
    local opt_ignore_case = el.attributes["ignore-case"] or tostring(doc_options["ignore-case"] or false)
    local opt_trim = el.attributes["trim"] or "true"
    local opt_collapse_space = el.attributes["collapse-space"] or "false"

    local is_html = FORMAT:match("html")
    if is_html then
      -- Renders as interactive text input
      local answers_attr = answers or answer or ""
      local html = string.format(
        '<span class="quarto-exercise-blank-container" data-answers="%s" data-match="%s" data-ignore-case="%s" data-trim="%s" data-collapse-space="%s" data-feedback-correct="%s" data-feedback-incorrect="%s">' ..
        '<input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank" />' ..
        '<span class="quarto-exercise-blank-correct-text" style="display: none;"></span>' ..
        '<span class="quarto-exercise-blank-feedback" aria-live="polite" style="display: none;"></span>' ..
        '</span>',
        answers_attr:gsub('"', '&quot;'),
        val_match,
        opt_ignore_case,
        opt_trim,
        opt_collapse_space,
        opt_feedback_correct:gsub('"', '&quot;'),
        opt_feedback_incorrect:gsub('"', '&quot;')
      )
      return pandoc.RawInline("html", html)
    else
      -- Fallback for PDF, Word, etc.
      local correct_ans = answer or answers or ""
      if doc_options["show-answers"] then
        return pandoc.Underline({pandoc.Str(correct_ans)})
      else
        return pandoc.Str("________")
      end
    end

  elseif el.classes:includes("choose") then
    local id = el.identifier
    if id == "" then id = get_unique_id("choose") end

    local valid_choose_attrs = {
      id = true, class = true, answer = true, options = true,
      ["ignore-case"] = true, shuffle = true,
      ["feedback-correct"] = true, ["feedback-incorrect"] = true
    }
    check_unsupported_attrs(el.attributes, valid_choose_attrs, id)

    validate_bool(el.attributes["ignore-case"], "ignore-case", id)
    validate_bool(el.attributes["shuffle"], "shuffle", id)

    local answer = el.attributes["answer"]
    if not answer or answer == "" then
      warn("choose block with no answer", id)
    end

    -- Options parsing
    local options_list = {}
    local options_attr = el.attributes["options"]
    if options_attr and options_attr ~= "" then
      for opt in string.gmatch(options_attr, "([^,]+)") do
        -- trim surrounding spaces
        opt = opt:gsub("^%s*(.-)%s*$", "%1")
        table.insert(options_list, opt)
      end
    else
      -- Parse options from span text
      local span_text = pandoc.utils.stringify(el)
      if span_text and span_text ~= "" then
        for opt in string.gmatch(span_text, "([^/]+)") do
          opt = opt:gsub("^%s*(.-)%s*$", "%1")
          table.insert(options_list, opt)
        end
      end
    end

    if #options_list == 0 then
      warn("choose block with no parseable options", id)
    end

    -- Check if answer is in options list
    if answer and #options_list > 0 then
      local found = false
      local ignore_case_choose = el.attributes["ignore-case"] == "true"
      for _, opt in ipairs(options_list) do
        if ignore_case_choose then
          if string.lower(opt) == string.lower(answer) then
            found = true
            break
          end
        else
          if opt == answer then
            found = true
            break
          end
        end
      end
      if not found then
        warn("choose block whose answer '" .. answer .. "' is not in the options list", id)
      end
    end

    local opt_feedback_correct = el.attributes["feedback-correct"] or doc_options["feedback-correct"]
    local opt_feedback_incorrect = el.attributes["feedback-incorrect"] or doc_options["feedback-incorrect"]
    local opt_ignore_case = el.attributes["ignore-case"] or "false"
    local opt_shuffle = el.attributes["shuffle"] or tostring(doc_options.shuffle or false)

    local answer_val = answer or ""
    local is_html = FORMAT:match("html")
    if is_html then
      -- Renders as dropdown
      local options_str = table.concat(options_list, ",")
      local html = string.format(
        '<span class="quarto-exercise-choose-container" data-answer="%s" data-options="%s" data-shuffle="%s" data-ignore-case="%s" data-feedback-correct="%s" data-feedback-incorrect="%s">' ..
        '<select class="quarto-exercise-choose-select"><option value="">Choose...</option></select>' ..
        '<span class="quarto-exercise-choose-correct-text" style="display: none;"></span>' ..
        '<button type="button" class="quarto-exercise-choose-check-btn">Check</button>' ..
        '<span class="quarto-exercise-choose-feedback" aria-live="polite" style="display: none;"></span>' ..
        '</span>',
        answer_val:gsub('"', '&quot;'),
        options_str:gsub('"', '&quot;'),
        opt_shuffle,
        opt_ignore_case,
        opt_feedback_correct:gsub('"', '&quot;'),
        opt_feedback_incorrect:gsub('"', '&quot;')
      )
      return pandoc.RawInline("html", html)
    else
      -- Fallback for non-HTML
      if doc_options["show-answers"] then
        return pandoc.Underline({pandoc.Str(answer_val)})
      else
        return pandoc.Str("________")
      end
    end
  end
  return nil
end

return {
  { Meta = Meta },
  { Div = Div },
  { Span = Span }
}
