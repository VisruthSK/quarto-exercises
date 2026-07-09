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
  ["ignore-case"] = false,
  ["obfuscate-answers"] = true
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

-- Cryptographic primitives for answer obfuscation (SHA-256, HMAC, AES-128-GCM)
local sha256 = {}
local sbox = {
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
}

local rcon = {
  0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
}

local function rrotate(x, n)
  return ((x >> n) | (x << (32 - n))) & 0xffffffff
end

local function rshift(x, n)
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

local function hmac_sha256(key, message)
  if #key > 64 then key = sha256.sha256(key) end
  if #key < 64 then key = key .. string.rep(string.char(0), 64 - #key) end
  local ipad = {}
  local opad = {}
  for i = 1, 64 do
    local k_byte = string.byte(key, i)
    ipad[i] = string.char(k_byte ~ 0x36)
    opad[i] = string.char(k_byte ~ 0x5c)
  end
  local inner = sha256.sha256(table.concat(ipad) .. message)
  return sha256.sha256(table.concat(opad) .. inner)
end

local function sub_word(w)
  return (sbox[((w >> 24) & 0xff) + 1] << 24) |
         (sbox[((w >> 16) & 0xff) + 1] << 16) |
         (sbox[((w >> 8) & 0xff) + 1] << 8) |
         sbox[(w & 0xff) + 1]
end

local function rot_word(w)
  return (((w << 8) & 0xffffffff) | (w >> 24)) & 0xffffffff
end

local function key_expansion(key_str)
  local w = {}
  for i = 0, 3 do
    local b1, b2, b3, b4 = string.byte(key_str, i*4 + 1, i*4 + 4)
    w[i] = (b1 << 24) | (b2 << 16) | (b3 << 8) | b4
  end
  for i = 4, 43 do
    local temp = w[i - 1]
    if i % 4 == 0 then
      temp = sub_word(rot_word(temp)) ~ (rcon[i // 4] << 24)
    end
    w[i] = w[i - 4] ~ temp
  end
  return w
end

local function galois_mul2(b)
  local h = b & 0x80
  local res = (b << 1) & 0xff
  if h ~= 0 then res = res ~ 0x1b end
  return res
end

local function aes_encrypt_block(block_str, round_keys)
  local state = {}
  for i = 0, 15 do state[i] = string.byte(block_str, i + 1) end
  local function add_round_key(r)
    local kw1 = round_keys[r * 4]
    local kw2 = round_keys[r * 4 + 1]
    local kw3 = round_keys[r * 4 + 2]
    local kw4 = round_keys[r * 4 + 3]
    local k_bytes = {
      (kw1 >> 24) & 0xff, (kw1 >> 16) & 0xff, (kw1 >> 8) & 0xff, kw1 & 0xff,
      (kw2 >> 24) & 0xff, (kw2 >> 16) & 0xff, (kw2 >> 8) & 0xff, kw2 & 0xff,
      (kw3 >> 24) & 0xff, (kw3 >> 16) & 0xff, (kw3 >> 8) & 0xff, kw3 & 0xff,
      (kw4 >> 24) & 0xff, (kw4 >> 16) & 0xff, (kw4 >> 8) & 0xff, kw4 & 0xff
    }
    for i = 0, 15 do state[i] = state[i] ~ k_bytes[i + 1] end
  end
  add_round_key(0)
  for r = 1, 9 do
    for i = 0, 15 do state[i] = sbox[state[i] + 1] end
    state[0], state[4], state[8], state[12] = state[0], state[4], state[8], state[12]
    state[1], state[5], state[9], state[13] = state[5], state[9], state[13], state[1]
    state[2], state[6], state[10], state[14] = state[10], state[14], state[2], state[6]
    state[3], state[7], state[11], state[15] = state[15], state[3], state[7], state[11]
    local temp = {}
    for col = 0, 3 do
      local i0 = col * 4
      local s0, s1, s2, s3 = state[i0], state[i0+1], state[i0+2], state[i0+3]
      temp[i0]   = galois_mul2(s0) ~ (galois_mul2(s1) ~ s1) ~ s2 ~ s3
      temp[i0+1] = s0 ~ galois_mul2(s1) ~ (galois_mul2(s2) ~ s2) ~ s3
      temp[i0+2] = s0 ~ s1 ~ galois_mul2(s2) ~ (galois_mul2(s3) ~ s3)
      temp[i0+3] = (galois_mul2(s0) ~ s0) ~ s1 ~ s2 ~ galois_mul2(s3)
    end
    for i = 0, 15 do state[i] = temp[i] end
    add_round_key(r)
  end
  for i = 0, 15 do state[i] = sbox[state[i] + 1] end
  state[0], state[4], state[8], state[12] = state[0], state[4], state[8], state[12]
  state[1], state[5], state[9], state[13] = state[5], state[9], state[13], state[1]
  state[2], state[6], state[10], state[14] = state[10], state[14], state[2], state[6]
  state[3], state[7], state[11], state[15] = state[15], state[3], state[7], state[11]
  add_round_key(10)
  local out_bytes = {}
  for i = 0, 15 do out_bytes[i + 1] = string.char(state[i]) end
  return table.concat(out_bytes)
end

local function gf_mul(X, Y)
  local Z = {0, 0, 0, 0}
  local V = {Y[1], Y[2], Y[3], Y[4]}
  local R = {0xe1000000, 0, 0, 0}
  for i = 0, 127 do
    local word_idx = (i >> 5) + 1
    local bit_idx = 31 - (i & 31)
    if (X[word_idx] & (1 << bit_idx)) ~= 0 then
      Z[1] = Z[1] ~ V[1]
      Z[2] = Z[2] ~ V[2]
      Z[3] = Z[3] ~ V[3]
      Z[4] = Z[4] ~ V[4]
    end
    local carry = (V[4] & 1) ~= 0
    V[4] = (V[4] >> 1) | ((V[3] & 1) << 31)
    V[3] = (V[3] >> 1) | ((V[2] & 1) << 31)
    V[2] = (V[2] >> 1) | ((V[1] & 1) << 31)
    V[1] = V[1] >> 1
    if carry then V[1] = V[1] ~ R[1] end
  end
  return Z
end

local function ghash(H, AAD, C)
  local padded_aad = AAD .. string.rep(string.char(0), (16 - (#AAD % 16)) % 16)
  local padded_c = C .. string.rep(string.char(0), (16 - (#C % 16)) % 16)
  local len_aad_bits = #AAD * 8
  local len_c_bits = #C * 8
  local len_block = string.char(
    (len_aad_bits >> 56) & 0xff, (len_aad_bits >> 48) & 0xff, (len_aad_bits >> 40) & 0xff, (len_aad_bits >> 32) & 0xff,
    (len_aad_bits >> 24) & 0xff, (len_aad_bits >> 16) & 0xff, (len_aad_bits >> 8) & 0xff, len_aad_bits & 0xff,
    (len_c_bits >> 56) & 0xff, (len_c_bits >> 48) & 0xff, (len_c_bits >> 40) & 0xff, (len_c_bits >> 32) & 0xff,
    (len_c_bits >> 24) & 0xff, (len_c_bits >> 16) & 0xff, (len_c_bits >> 8) & 0xff, len_c_bits & 0xff
  )
  local data = padded_aad .. padded_c .. len_block
  local Y = {0, 0, 0, 0}
  local H_words = {
    (H[1] << 24) | (H[2] << 16) | (H[3] << 8) | H[4],
    (H[5] << 24) | (H[6] << 16) | (H[7] << 8) | H[8],
    (H[9] << 24) | (H[10] << 16) | (H[11] << 8) | H[12],
    (H[13] << 24) | (H[14] << 16) | (H[15] << 8) | H[16]
  }
  for i = 1, #data, 16 do
    local b1, b2, b3, b4 = string.byte(data, i, i + 3)
    local b5, b6, b7, b8 = string.byte(data, i + 4, i + 7)
    local b9, b10, b11, b12 = string.byte(data, i + 8, i + 11)
    local b13, b14, b15, b16 = string.byte(data, i + 12, i + 15)
    local X = {
      (b1 << 24) | (b2 << 16) | (b3 << 8) | b4,
      (b5 << 24) | (b6 << 16) | (b7 << 8) | b8,
      (b9 << 24) | (b10 << 16) | (b11 << 8) | b12,
      (b13 << 24) | (b14 << 16) | (b15 << 8) | b16
    }
    Y[1] = Y[1] ~ X[1]
    Y[2] = Y[2] ~ X[2]
    Y[3] = Y[3] ~ X[3]
    Y[4] = Y[4] ~ X[4]
    Y = gf_mul(Y, H_words)
  end
  local out_bytes = {}
  for word_idx = 1, 4 do
    local w = Y[word_idx]
    out_bytes[#out_bytes + 1] = string.char((w >> 24) & 0xff, (w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff)
  end
  return table.concat(out_bytes)
end

local function aes_gcm_encrypt(plaintext, key, iv, aad)
  local round_keys = key_expansion(key)
  local zero_block = string.rep(string.char(0), 16)
  local H_str = aes_encrypt_block(zero_block, round_keys)
  local H = {}
  for i = 1, 16 do H[i] = string.byte(H_str, i) end
  
  local C_parts = {}
  local num_blocks = math.ceil(#plaintext / 16)
  for i = 1, num_blocks do
    local counter = i + 1
    local counter_str = string.char((counter >> 24) & 0xff, (counter >> 16) & 0xff, (counter >> 8) & 0xff, counter & 0xff)
    local J_i = iv .. counter_str
    local keystream = aes_encrypt_block(J_i, round_keys)
    local start_idx = (i - 1) * 16 + 1
    local end_idx = math.min(i * 16, #plaintext)
    local p_block = string.sub(plaintext, start_idx, end_idx)
    local c_block_bytes = {}
    for j = 1, #p_block do
      c_block_bytes[j] = string.char(string.byte(p_block, j) ~ string.byte(keystream, j))
    end
    C_parts[#C_parts + 1] = table.concat(c_block_bytes)
  end
  local C = table.concat(C_parts)
  local S = ghash(H, aad, C)
  local J0 = iv .. string.char(0, 0, 0, 1)
  local encrypted_J0 = aes_encrypt_block(J0, round_keys)
  local tag_bytes = {}
  for i = 1, 16 do tag_bytes[i] = string.char(string.byte(S, i) ~ string.byte(encrypted_J0, i)) end
  return C, table.concat(tag_bytes)
end

local function hex_to_bytes(hex)
  local bytes = {}
  for i = 1, #hex, 2 do bytes[#bytes + 1] = string.char(tonumber(string.sub(hex, i, i + 1), 16)) end
  return table.concat(bytes)
end

local function bytes_to_hex(bytes)
  local hex = {}
  for i = 1, #bytes do hex[#hex + 1] = string.format("%02x", string.byte(bytes, i)) end
  return table.concat(hex)
end

local function encrypt_string(plaintext, key_hex)
  local key = hex_to_bytes(key_hex)
  local iv_hash = hmac_sha256(key, plaintext)
  local iv = string.sub(iv_hash, 1, 12)
  local C, tag = aes_gcm_encrypt(plaintext, key, iv, "")
  return bytes_to_hex(iv .. C .. tag)
end

local function derive_key(id)
  local master_key = options["_key"]
  if not master_key or master_key == "" then return nil end
  local derived = hmac_sha256(master_key, id)
  return bytes_to_hex(derived):sub(1, 32)
end

local json_encode

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

local function render_html_exercise(data, id, exercise_options)
  local output = pandoc.List()
  local input_type = data.correct_count > 1 and "checkbox" or "radio"

  local key_obf = derive_key(id)
  local metadata = { correct = {}, keys = {} }
  local encrypted_meta = ""
  if options["obfuscate-answers"] then
    for _, answer in ipairs(data.answers) do
      local token = bytes_to_hex(hmac_sha256(hex_to_bytes(key_obf), answer.key)):sub(1, 32)
      metadata.keys[token] = answer.key
      if answer.correct then
        table.insert(metadata.correct, token)
      end
    end
    encrypted_meta = encrypt_string(json_encode(metadata), key_obf)
  end

  local div_attrs = {
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
  }
  if options["obfuscate-answers"] then
    div_attrs["data-pbk"] = key_obf
    div_attrs["data-pba"] = encrypted_meta
  end

  output:insert(raw_block("div", div_attrs))

  for _, block in ipairs(data.stem) do
    output:insert(block)
  end

  if #data.answers > 0 then
    output:insert(pandoc.RawBlock("html", '<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">'))
    for _, answer in ipairs(data.answers) do
      local answer_key = answer.key
      local data_correct_attr = ' data-correct="' .. tostring(answer.correct) .. '"'
      if options["obfuscate-answers"] then
        answer_key = bytes_to_hex(hmac_sha256(hex_to_bytes(key_obf), answer.key)):sub(1, 32)
        data_correct_attr = ''
      end
      local input_id = id .. "-" .. answer_key
      output:insert(pandoc.RawBlock("html",
        '<div class="quarto-exercise-answer" data-key="' .. html_escape(answer_key) .. '"' .. data_correct_attr .. '>' ..
        '<div class="quarto-exercise-control">' ..
        '<input id="' .. html_escape(input_id) .. '" type="' .. input_type .. '" name="' .. html_escape(id) .. '" value="' .. html_escape(answer_key) .. '" class="quarto-exercise-input" />' ..
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
  local key_obf = derive_key(parent_id or id)
  if options["obfuscate-answers"] then
    for token, info in pairs(metadata) do
      local encrypted_attrs = encrypt_string(json_encode(info.attrs), key_obf)
      info.pba = encrypted_attrs
      info.attrs = nil
    end
  end

  local meta_json = json_encode(metadata)
  local classes = { "quarto-exercise-code-cloze-container" }
  if parent_id == nil then
    classes[#classes + 1] = "quarto-exercise-code-cloze-standalone"
  end

  local container_attrs = {
    class = table.concat(classes, " "),
    ["data-cloze-metadata"] = meta_json
  }
  if options["obfuscate-answers"] then
    container_attrs["data-pbk"] = key_obf
  end

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

  local key_obf = derive_key(id)
  local container_attrs = {
    class = "quarto-exercise-blank-container",
    ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["data-feedback-incorrect"] = attr_or_empty(el.attributes, "feedback-incorrect")
  }

  if options["obfuscate-answers"] then
    local metadata = {
      answers = answer,
      match = match,
      ignoreCase = (normalize_bool(el.attributes["ignore-case"]) or tostring(options["ignore-case"])) == "true",
      trim = (el.attributes.trim or "true") ~= "false",
      collapseSpace = (el.attributes["collapse-space"] or "false") == "true"
    }
    container_attrs["data-pbk"] = key_obf
    container_attrs["data-pba"] = encrypt_string(json_encode(metadata), key_obf)
  else
    container_attrs["data-answers"] = answer
    container_attrs["data-match"] = match
    container_attrs["data-ignore-case"] = normalize_bool(el.attributes["ignore-case"]) or tostring(options["ignore-case"])
    container_attrs["data-trim"] = el.attributes.trim or "true"
    container_attrs["data-collapse-space"] = el.attributes["collapse-space"] or "false"
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

  local key_obf = derive_key(id)
  local container_attrs = {
    class = "quarto-exercise-choose-container",
    ["data-options"] = join_values(values, "|"),
    ["data-shuffle"] = normalize_bool(el.attributes.shuffle) or tostring(options.shuffle),
    ["data-feedback-correct"] = string_option(el.attributes, "feedback-correct"),
    ["data-feedback-incorrect"] = string_option(el.attributes, "feedback-incorrect")
  }

  if options["obfuscate-answers"] then
    local metadata = {
      answer = answer,
      ignoreCase = (normalize_bool(el.attributes["ignore-case"]) or "false") == "true"
    }
    container_attrs["data-pbk"] = key_obf
    container_attrs["data-pba"] = encrypt_string(json_encode(metadata), key_obf)
  else
    container_attrs["data-answer"] = answer
    container_attrs["data-ignore-case"] = normalize_bool(el.attributes["ignore-case"]) or "false"
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

  local obfuscate = true
  if options["obfuscate-answers"] ~= nil then
    local val = normalize_bool(options["obfuscate-answers"])
    if val == "false" or options["obfuscate-answers"] == false then
      obfuscate = false
    end
  end
  if os.getenv("QUARTO_EXERCISES_DISABLE_OBFUSCATION") == "true" then
    obfuscate = false
  end
  options["obfuscate-answers"] = obfuscate

  if obfuscate then
    local key = os.getenv("QUARTO_EXERCISES_KEY")
    if not key or key == "" then
      error("quarto-exercises error: 'obfuscate-answers' is enabled (default), but the build-time environment variable 'QUARTO_EXERCISES_KEY' is missing or empty. Please set 'QUARTO_EXERCISES_KEY' (e.g. generate one with 'openssl rand -hex 32') or set 'obfuscate-answers: false' in your settings.")
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
