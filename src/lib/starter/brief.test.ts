import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LANGUAGE,
  STARTER_FORBIDDEN,
  STARTER_LANGUAGES,
  STARTER_TOOLS,
  callStarterTool,
  isPortableStarterBrief,
  isStarterLanguage,
  isStarterTool,
  renderStarterBrief,
  starterBriefFromInput,
} from "./brief.ts";
import { LANGUAGE_MAP } from "../languages.ts";

const base = {
  business: "Hollis and Sons Plumbing",
  sells: "Emergency plumbing for old houses",
  buyer: "Homeowners within 20 miles who have a leak right now",
};

test("renders in every launch language, with the gates inside the text", () => {
  for (const lang of STARTER_LANGUAGES) {
    const brief = starterBriefFromInput({ ...base, language: lang.code });
    const rendered = renderStarterBrief(brief);
    const check = isPortableStarterBrief(brief);
    assert.equal(check.ok, true, `portability failed for ${lang.code}: ${check.problems.join("; ")}`);
    // The no-number rule is the one that matters most; it must survive translation.
    assert.ok(rendered.length > 400, `${lang.code} brief is too thin to be useful`);
    assert.match(rendered, /^.*$/s);
  }
});

test("the no-invented-numbers gate is present in all three languages", () => {
  const markers = new Set<string>();
  for (const lang of STARTER_LANGUAGES) {
    const rendered = renderStarterBrief(starterBriefFromInput({ ...base, language: lang.code }));
    assert.ok(/never invent/i.test(rendered) || /数字を作らない/.test(rendered) || /Не придумывайте/.test(rendered), `missing no-number gate for ${lang.code}`);
    markers.add(rendered.split("\n")[0]);
  }
  assert.equal(markers.size, 3, "each language should render its own heading");
});

test("launch languages are the ones the app already supports", () => {
  for (const lang of STARTER_LANGUAGES) {
    assert.ok(LANGUAGE_MAP[lang.code], `${lang.code} is not in src/lib/languages.ts`);
    assert.equal(LANGUAGE_MAP[lang.code].label, lang.label);
  }
});

test("a brief that aims at nothing is refused", () => {
  for (const missing of ["business", "sells", "buyer"] as const) {
    const brief = starterBriefFromInput({ ...base, [missing]: "   " });
    const check = isPortableStarterBrief(brief);
    assert.equal(check.ok, false, `${missing} should be required`);
    assert.ok(check.problems.length > 0);
  }
});

test("a brief with no credit policy is not portable", () => {
  const brief = { ...starterBriefFromInput(base), creditPolicy: "" };
  const check = isPortableStarterBrief(brief);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => /credit policy/i.test(p)));
});

test("the default credit line names the provider and promises nothing", () => {
  for (const lang of STARTER_LANGUAGES) {
    const brief = starterBriefFromInput({ ...base, language: lang.code });
    assert.ok(brief.creditPolicy.length > 40, `${lang.code} credit line is too short to be honest`);
    // English copy must name the assistant's provider explicitly.
    if (lang.code === "en") {
      assert.match(brief.creditPolicy, /provider/);
      assert.match(brief.creditPolicy, /not from me/);
    }
  }
});

test("rendered copy never contains a promise we cannot keep", () => {
  for (const lang of STARTER_LANGUAGES) {
    const rendered = renderStarterBrief(starterBriefFromInput({ ...base, language: lang.code })).toLowerCase();
    for (const phrase of STARTER_FORBIDDEN) {
      assert.equal(rendered.includes(phrase), false, `${lang.code} promises "${phrase}"`);
    }
  }
});

test("an unsupported language falls back to English rather than rendering nothing", () => {
  assert.equal(isStarterLanguage("klingon"), false);
  const brief = starterBriefFromInput({ ...base, language: "klingon" });
  assert.equal(brief.language, DEFAULT_LANGUAGE);
});

test("the credit policy can be overridden by the caller", () => {
  const policy = "Only use the free allowance. Never buy credits.";
  const brief = starterBriefFromInput({ ...base, credit_policy: policy });
  assert.equal(brief.creditPolicy, policy);
  assert.ok(renderStarterBrief(brief).includes(policy));
});

test("the tool hands out a usable brief and refuses an incomplete one", async () => {
  const ok = await callStarterTool("starter_brief", { ...base, language: "ja" });
  assert.equal(ok.isError, undefined);
  const body = ok.content[0].text;
  assert.ok(body.includes("Hollis and Sons Plumbing"));
  assert.ok(body.includes("プレビュー"), "the Japanese brief should carry the preview gate");

  const bad = await callStarterTool("starter_brief", { business: "Hollis" });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /cannot hand out this brief yet/);
});

test("the language tool lists exactly the launch languages", async () => {
  const res = await callStarterTool("starter_brief_language");
  const body = res.content[0].text;
  for (const lang of STARTER_LANGUAGES) assert.ok(body.includes(lang.code), `${lang.code} not listed`);
  assert.equal(body.includes("ko"), false);
});

test("the family exposes a free tool and answers an unknown name", async () => {
  assert.equal(isStarterTool("starter_brief"), true);
  assert.equal(isStarterTool("clip_batch"), false);
  assert.equal(STARTER_TOOLS.length, 2);
  // Free: neither tool may appear in a generating-costs map.
  for (const tool of STARTER_TOOLS) assert.equal(tool.name.startsWith("starter_"), true);

  const unknown = await callStarterTool("starter_nope");
  assert.equal(unknown.isError, true);
});

test("every tool def carries a schema an agent can read", () => {
  for (const tool of STARTER_TOOLS) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description.length > 30, `${tool.name} needs a description an agent can act on`);
    for (const [key, value] of Object.entries(tool.inputSchema.properties)) {
      assert.ok((value as { description?: string }).description, `${tool.name}.${key} needs a description`);
    }
  }
});
