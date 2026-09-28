import { describe, it, expect } from "vitest";
import { parsePromptIntent } from "./promptParser";

describe("promptParser", () => {
  it("extracts affirmative text without exclusions when no negative words are present", () => {
    const res = parsePromptIntent("young noble in a palace");
    expect(res.affirmativeText).toBe("young noble in a palace");
    expect(res.excludedPhrases).toEqual([]);
    expect(res.excludedWords.size).toBe(0);
  });

  it("handles 'young noble' versus 'young noble, no dragon, no armor'", () => {
    const res = parsePromptIntent("young noble, no dragon, no armor");
    expect(res.affirmativeText).toBe("young noble");
    expect(res.excludedWords.has("dragon")).toBe(true);
    expect(res.excludedWords.has("armor")).toBe(true);
    expect(res.excludedWords.has("noble")).toBe(false);
  });

  it("handles 'nobre de seda branca, sem dragões e sem armadura'", () => {
    const res = parsePromptIntent("nobre de seda branca, sem dragões e sem armadura");
    expect(res.affirmativeText).toBe("nobre de seda branca");
    expect(res.excludedWords.has("dragoes") || res.excludedWords.has("dragao")).toBe(true);
    expect(res.excludedWords.has("armadura")).toBe(true);
    expect(res.excludedWords.has("seda")).toBe(false);
  });

  it("handles 'without wings, holding a golden staff'", () => {
    const res = parsePromptIntent("without wings, holding a golden staff");
    expect(res.affirmativeText).toBe("holding a golden staff");
    expect(res.excludedWords.has("wings") || res.excludedWords.has("wing")).toBe(true);
    expect(res.excludedWords.has("staff")).toBe(false);
    expect(res.excludedWords.has("golden")).toBe(false);
  });

  it("handles 'a dragon beside a knight without armor'", () => {
    const res = parsePromptIntent("a dragon beside a knight without armor");
    expect(res.affirmativeText).toBe("a dragon beside a knight");
    expect(res.excludedWords.has("armor")).toBe(true);
    expect(res.excludedWords.has("dragon")).toBe(false); // dragon is affirmative!
    expect(res.excludedWords.has("knight")).toBe(false);
  });

  it("does not treat 'not only' as an exclusion ('not only a knight but also a dragon')", () => {
    const res = parsePromptIntent("not only a knight but also a dragon");
    expect(res.affirmativeText).toBe("not only a knight but also a dragon");
    expect(res.excludedPhrases).toEqual([]);
    expect(res.excludedWords.has("knight")).toBe(false);
    expect(res.excludedWords.has("dragon")).toBe(false);
  });

  it("does not confuse words containing 'no' or 'sem' with negations", () => {
    const res = parsePromptIntent("noble knight in northern snow, semente sagrada");
    expect(res.affirmativeText).toBe("noble knight in northern snow, semente sagrada");
    expect(res.excludedWords.size).toBe(0);
  });

  it("handles 'avoid vampires' and 'evitar vampiros'", () => {
    const resEn = parsePromptIntent("gothic castle, avoid vampires");
    expect(resEn.affirmativeText).toBe("gothic castle");
    expect(resEn.excludedWords.has("vampire") || resEn.excludedWords.has("vampires")).toBe(true);

    const resPt = parsePromptIntent("castelo gotico, evitar vampiros");
    expect(resPt.affirmativeText).toBe("castelo gotico");
    expect(resPt.excludedWords.has("vampiros") || resPt.excludedWords.has("vampiro")).toBe(true);
  });

  it("handles 'não incluir asas'", () => {
    const res = parsePromptIntent("guerreiro celestial, não incluir asas");
    expect(res.affirmativeText).toBe("guerreiro celestial");
    expect(res.excludedWords.has("asas") || res.excludedWords.has("asa")).toBe(true);
  });

  describe("Distinguir preposição portuguesa 'no' da negação inglesa 'no'", () => {
    it("recognizes 'Um nobre no palácio de mármore branco' as fully affirmative with no exclusions", () => {
      const res = parsePromptIntent("Um nobre no palácio de mármore branco");
      expect(res.affirmativeText).toBe("Um nobre no palácio de mármore branco");
      expect(res.excludedPhrases).toEqual([]);
      expect(res.excludedWords.size).toBe(0);
    });

    it("recognizes 'Um mago no templo' as fully affirmative with no exclusions", () => {
      const res = parsePromptIntent("Um mago no templo");
      expect(res.affirmativeText).toBe("Um mago no templo");
      expect(res.excludedPhrases).toEqual([]);
      expect(res.excludedWords.size).toBe(0);
    });

    it("maintains 'young noble, no armor' as English negation (armor is excluded)", () => {
      const res = parsePromptIntent("young noble, no armor");
      expect(res.affirmativeText).toBe("young noble");
      expect(res.excludedWords.has("armor")).toBe(true);
    });

    it("handles 'nobre no palácio, sem armadura' (palácio affirmative, armadura excluded)", () => {
      const res = parsePromptIntent("nobre no palácio, sem armadura");
      expect(res.affirmativeText).toBe("nobre no palácio");
      expect(res.excludedWords.has("armadura")).toBe(true);
      expect(res.excludedWords.has("palacio") || res.excludedWords.has("palácio")).toBe(false);
    });
  });

  describe("Preservar o escopo de enumerações negativas", () => {
    it("excludes all items in 'young noble; avoid dragons, armor and vampires.'", () => {
      const res = parsePromptIntent("young noble; avoid dragons, armor and vampires.");
      expect(res.affirmativeText).toBe("young noble");
      expect(res.excludedWords.has("dragon") || res.excludedWords.has("dragons")).toBe(true);
      expect(res.excludedWords.has("armor")).toBe(true);
      expect(res.excludedWords.has("vampire") || res.excludedWords.has("vampires")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
    });

    it("excludes all items in 'nobre; evitar dragões, armaduras e vampiros.'", () => {
      const res = parsePromptIntent("nobre; evitar dragões, armaduras e vampiros.");
      expect(res.affirmativeText).toBe("nobre");
      expect(res.excludedWords.has("dragao") || res.excludedWords.has("dragoes") || res.excludedWords.has("dragões")).toBe(true);
      expect(res.excludedWords.has("armadura") || res.excludedWords.has("armaduras")).toBe(true);
      expect(res.excludedWords.has("vampiro") || res.excludedWords.has("vampiros")).toBe(true);
      expect(res.excludedWords.has("nobre")).toBe(false);
    });

    it("preserves affirmative transition in 'no dragon, wearing white silk'", () => {
      const res = parsePromptIntent("no dragon, wearing white silk");
      expect(res.affirmativeText).toBe("wearing white silk");
      expect(res.excludedWords.has("dragon")).toBe(true);
      expect(res.excludedWords.has("silk")).toBe(false);
      expect(res.excludedWords.has("white")).toBe(false);
    });

    it("preserves affirmative transition in 'without wings, holding a golden staff'", () => {
      const res = parsePromptIntent("without wings, holding a golden staff");
      expect(res.affirmativeText).toBe("holding a golden staff");
      expect(res.excludedWords.has("wings") || res.excludedWords.has("wing")).toBe(true);
      expect(res.excludedWords.has("staff")).toBe(false);
      expect(res.excludedWords.has("golden")).toBe(false);
    });

    it("preserves affirmative sentence in 'Avoid dragons, armor and vampires. A noble holds a golden staff.'", () => {
      const res = parsePromptIntent("Avoid dragons, armor and vampires. A noble holds a golden staff.");
      expect(res.affirmativeText).toBe("A noble holds a golden staff");
      expect(res.excludedWords.has("dragon") || res.excludedWords.has("dragons")).toBe(true);
      expect(res.excludedWords.has("armor")).toBe(true);
      expect(res.excludedWords.has("vampire") || res.excludedWords.has("vampires")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
      expect(res.excludedWords.has("staff")).toBe(false);
    });
  });

  describe("Complemento Rodada 1: 'do not' e complementos verbais de avoid", () => {
    it("handles 'A noble, no red clothing' as exclusion", () => {
      const res = parsePromptIntent("A noble, no red clothing");
      expect(res.affirmativeText).toBe("A noble");
      expect(res.excludedWords.has("red")).toBe(true);
      expect(res.excludedWords.has("clothing") || res.excludedWords.has("cloth")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
    });

    it("handles 'A noble, no red clothing, do not include vampires' without false Portuguese context", () => {
      const res = parsePromptIntent("A noble, no red clothing, do not include vampires");
      expect(res.affirmativeText).toBe("A noble");
      expect(res.excludedWords.has("red")).toBe(true);
      expect(res.excludedWords.has("clothing") || res.excludedWords.has("cloth")).toBe(true);
      expect(res.excludedWords.has("vampire") || res.excludedWords.has("vampires")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
    });

    it("handles 'A human noble, no black wyvern, do not include text'", () => {
      const res = parsePromptIntent("A human noble, no black wyvern, do not include text");
      expect(res.affirmativeText).toBe("A human noble");
      expect(res.excludedWords.has("black")).toBe(true);
      expect(res.excludedWords.has("wyvern")).toBe(true);
      expect(res.excludedWords.has("text")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
    });

    it("handles 'A white-robed noble, no extra limbs, do not include text or logos'", () => {
      const res = parsePromptIntent("A white-robed noble, no extra limbs, do not include text or logos");
      expect(res.affirmativeText).toBe("A white-robed noble");
      expect(res.excludedWords.has("limbs") || res.excludedWords.has("limb")).toBe(true);
      expect(res.excludedWords.has("extra")).toBe(true);
      expect(res.excludedWords.has("text")).toBe(true);
      expect(res.excludedWords.has("logos") || res.excludedWords.has("logo")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
    });

    it("preserves 'Um nobre no palácio' and 'Um mago no templo'", () => {
      const res1 = parsePromptIntent("Um nobre no palácio");
      expect(res1.affirmativeText).toBe("Um nobre no palácio");
      expect(res1.excludedPhrases).toEqual([]);

      const res2 = parsePromptIntent("Um mago no templo");
      expect(res2.affirmativeText).toBe("Um mago no templo");
      expect(res2.excludedPhrases).toEqual([]);
    });

    it("preserves 'nobre no palácio, sem armadura'", () => {
      const res = parsePromptIntent("nobre no palácio, sem armadura");
      expect(res.affirmativeText).toBe("nobre no palácio");
      expect(res.excludedWords.has("armadura")).toBe(true);
      expect(res.excludedWords.has("palacio")).toBe(false);
    });

    it("distinguishes shared word 'altar' ('A noble, no altar' vs 'Um mago no altar')", () => {
      const resEn = parsePromptIntent("A noble, no altar");
      expect(resEn.affirmativeText).toBe("A noble");
      expect(resEn.excludedWords.has("altar")).toBe(true);

      const resPt = parsePromptIntent("Um mago no altar");
      expect(resPt.affirmativeText).toBe("Um mago no altar");
      expect(resPt.excludedWords.has("altar")).toBe(false);
      expect(resPt.excludedPhrases).toEqual([]);
    });

    it("handles 'A noble, avoid wearing black clothes' (wearing is avoid's complement, not affirmative transition)", () => {
      const res = parsePromptIntent("A noble, avoid wearing black clothes");
      expect(res.affirmativeText).toBe("A noble");
      expect(res.excludedWords.has("black")).toBe(true);
      expect(res.excludedWords.has("clothes") || res.excludedWords.has("cloth")).toBe(true);
      expect(res.excludedWords.has("noble")).toBe(false);
    });

    it("handles 'avoid holding weapons'", () => {
      const res = parsePromptIntent("avoid holding weapons");
      expect(res.affirmativeText).toBe("");
      expect(res.excludedWords.has("weapons") || res.excludedWords.has("weapon")).toBe(true);
    });

    it("preserves affirmative transition in 'no dragon, wearing white silk'", () => {
      const res = parsePromptIntent("no dragon, wearing white silk");
      expect(res.affirmativeText).toBe("wearing white silk");
      expect(res.excludedWords.has("dragon")).toBe(true);
      expect(res.excludedWords.has("silk")).toBe(false);
    });

    it("preserves affirmative transition in 'without wings, holding a golden staff'", () => {
      const res = parsePromptIntent("without wings, holding a golden staff");
      expect(res.affirmativeText).toBe("holding a golden staff");
      expect(res.excludedWords.has("wings") || res.excludedWords.has("wing")).toBe(true);
      expect(res.excludedWords.has("staff")).toBe(false);
    });
  });
});
