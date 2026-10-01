import type { SolutionOut } from "./ai/schemas";
import { resolveStage1, resolveStage2, validateIds, type Stage1Raw, type Stage2Raw } from "./classification";
import { scheduleNext, type Rating } from "./srs";
import { getDB, getTax, mutate, newQuestion, nowIso, uid, type Formula, type Question, type ReviewEvent } from "./store";
import { canonicalFormulaKey } from "./pipeline";
import { normalizeQuestionText, sha256 } from "./text";

interface SampleDef {
  text: string;
  source: string;
  s1: Stage1Raw;
  s2: Stage2Raw;
  solution: Omit<SolutionOut, "hints" | "confidence" | "answerable" | "issues"> & { hints: string[] };
  verified: boolean;
  formulas: { name: string; expression: string; latex: string; variables: { symbol: string; meaning: string; unit: string }[]; units: string; whenToUse: string; restrictions: string; concepts: string[] }[];
  trick?: { name: string; explanation: string; whenItWorks: string; whyItWorks: string; limitations: string; normalMethod: string; shortcutMethod: string; validityCheck: string };
  mistakes: { category: string; title: string; description: string; preventionTip: string }[];
  /** days ago → rating */
  history: [number, Rating, number?][];
  addedDaysAgo: number;
}

const D = (n: number) => new Date(Date.now() - n * 86_400_000);

const SAMPLES: SampleDef[] = [
  {
    text: "A copper wire has a resistance of $10\\,\\Omega$ at $20^\\circ\\text{C}$. If the temperature coefficient of resistance of copper is $4\\times10^{-3}\\,\\text{per}^\\circ\\text{C}$, find the resistance of the wire at $70^\\circ\\text{C}$.",
    source: "Sample · Current Electricity worksheet",
    s1: { exam: "JEE Main", class: "Class 12", subject: "Physics", unit: "Electricity, Magnetism & Electronics", chapter: "Current Electricity", confidence: { exam: 0.9, class: 0.9, subject: 0.99, unit: 0.97, chapter: 0.97 } },
    s2: {
      subchapter: "Electrical Resistance", topic: "Resistivity and Conductivity", subtopic: "Temperature Dependence of Resistance", concepts: ["Concept of resistance variation with temperature", "Temperature coefficient of resistance"],
      question_type: "Numerical", difficulty: "Medium", difficulty_confidence: 0.8, tags: ["temperature-coefficient", "resistance", "formula-substitution"],
      confidence: { subchapter: 0.91, topic: 0.88, subtopic: 0.84, concept: 0.82, question_type: 0.97 }, suggestions: {},
    },
    solution: {
      solution_type: "numerical", given: ["$R_0 = 10\\,\\Omega$ at $T_0 = 20^\\circ$C", "$\\alpha = 4\\times10^{-3}\\,/^\\circ$C", "$T = 70^\\circ$C"], required: "Resistance $R_T$ at $70^\\circ$C",
      concept: "For a metallic conductor over a modest temperature range, resistance varies approximately linearly with temperature.",
      approach: "Apply the linear temperature-dependence formula using the reference temperature of the given resistance.",
      steps: ["$\\Delta T = 70 - 20 = 50^\\circ\\text{C}$", "$R_T = R_0\\,[1 + \\alpha\\,\\Delta T]$", "$R_T = 10\\,[1 + (4\\times10^{-3})(50)] = 10\\,[1 + 0.2]$", "$R_T = 10 \\times 1.2 = 12\\,\\Omega$"],
      unit_handling: "$\\alpha$ is per °C and $\\Delta T$ is in °C, so the product is dimensionless.", final_answer: "$R_T = 12\\,\\Omega$",
      verification: "Resistance of a metal increases with temperature, and the 20% rise matches $\\alpha\\Delta T = 0.2$. ✓", important_points: [], exam_ready_answer: "", assumptions: [], validity_conditions: "Linear approximation, valid for small temperature ranges.",
      hints: ["Think about how the resistance of a metal changes with temperature.", "Use $R_T = R_0[1+\\alpha(T-T_0)]$, with $T_0$ the temperature at which $R_0$ is given.", "First compute $\\Delta T = 70-20$ and then $\\alpha\\,\\Delta T$."],
    },
    verified: true,
    formulas: [{
      name: "Temperature dependence of resistance", expression: "R_T = R_0 [1 + α (T − T_0)]", latex: "R_T = R_0\\left[1+\\alpha (T-T_0)\\right]",
      variables: [{ symbol: "R_T", meaning: "resistance at temperature T", unit: "Ω" }, { symbol: "R_0", meaning: "resistance at reference temperature T_0", unit: "Ω" }, { symbol: "α", meaning: "temperature coefficient of resistance", unit: "per °C" }],
      units: "Ω", whenToUse: "Metallic conductors over a modest temperature range.", restrictions: "Linear approximation; not valid for semiconductors or very large ΔT.", concepts: ["Temperature coefficient of resistance"],
    }],
    mistakes: [
      { category: "wrong formula", title: "Using T instead of ΔT", description: "Substituting 70 directly instead of (70 − 20).", preventionTip: "Always compute ΔT = T − T₀ with the reference temperature of R₀." },
      { category: "unit conversion", title: "Converting to kelvin unnecessarily", description: "Adding 273 changes nothing for ΔT but invites arithmetic slips.", preventionTip: "A temperature difference is the same in °C and K." },
    ],
    history: [[9, "good"], [5, "hard"], [1, "good"]], addedDaysAgo: 10,
  },
  {
    text: "Two cells of emf $6\\,\\text{V}$ and $4\\,\\text{V}$, each with internal resistance $1\\,\\Omega$, are connected in parallel (like poles together) across an external resistance of $2\\,\\Omega$. Find the current through the external resistance.",
    source: "Sample · HC Verma style",
    s1: { exam: "JEE Main", class: "Class 12", subject: "Physics", unit: "Electricity, Magnetism & Electronics", chapter: "Current Electricity", confidence: { exam: 0.9, class: 0.9, subject: 0.99, unit: 0.97, chapter: 0.95 } },
    s2: {
      subchapter: "Cells and EMF", topic: "Combination of cells", subtopic: "unknown", concepts: ["Series and parallel grouping of cells", "Terminal voltage"],
      question_type: "Numerical", difficulty: "Medium", difficulty_confidence: 0.7, tags: ["parallel-cells", "internal-resistance", "millman"],
      confidence: { subchapter: 0.93, topic: 0.9, subtopic: 0.4, concept: 0.86, question_type: 0.96 }, suggestions: {},
    },
    solution: {
      solution_type: "numerical", given: ["$E_1 = 6$ V, $r_1 = 1\\,\\Omega$", "$E_2 = 4$ V, $r_2 = 1\\,\\Omega$", "$R = 2\\,\\Omega$"], required: "Current $I$ through $R$",
      concept: "Cells in parallel can be replaced by one equivalent cell whose emf and resistance follow from Kirchhoff's laws.",
      approach: "Reduce the two cells to an equivalent emf and internal resistance, then apply Ohm's law to the circuit.",
      steps: ["$E_{eq} = \\dfrac{E_1/r_1 + E_2/r_2}{1/r_1 + 1/r_2} = \\dfrac{6+4}{2} = 5\\,\\text{V}$", "$r_{eq} = \\dfrac{r_1 r_2}{r_1 + r_2} = 0.5\\,\\Omega$", "$I = \\dfrac{E_{eq}}{R + r_{eq}} = \\dfrac{5}{2 + 0.5} = 2\\,\\text{A}$"],
      unit_handling: "All in SI units (V, Ω, A).", final_answer: "$I = 2\\,\\text{A}$",
      verification: "Check with KVL: $I_1 + I_2 = 2$ A and $6 - I_1 = 4 - I_2 = 4$ V across R → $I_1 = 2$, $I_2 = 0$. Terminal voltage $= 2\\times2 = 4$ V, consistent. ✓", important_points: [], exam_ready_answer: "", assumptions: [], validity_conditions: "Like poles connected together.",
      hints: ["Which circuit idea lets you replace two cells by one?", "Find the equivalent emf of cells in parallel using $E_{eq}=\\frac{E_1/r_1+E_2/r_2}{1/r_1+1/r_2}$.", "Find $E_{eq}$ and $r_{eq}$ first, then use $I=E_{eq}/(R+r_{eq})$."],
    },
    verified: true,
    formulas: [
      {
        name: "Equivalent EMF of cells in parallel", expression: "E_eq = (E1/r1 + E2/r2) / (1/r1 + 1/r2)", latex: "E_{eq}=\\dfrac{E_1/r_1+E_2/r_2}{1/r_1+1/r_2}",
        variables: [{ symbol: "E_i", meaning: "emf of the i-th cell", unit: "V" }, { symbol: "r_i", meaning: "internal resistance of the i-th cell", unit: "Ω" }], units: "V",
        whenToUse: "Two or more cells connected in parallel with like poles together.", restrictions: "Opposite polarity needs a sign on the emf term.", concepts: ["Series and parallel grouping of cells"],
      },
      {
        name: "Ohm's law for a complete circuit", expression: "I = E / (R + r)", latex: "I=\\dfrac{E}{R+r}",
        variables: [{ symbol: "I", meaning: "current", unit: "A" }, { symbol: "E", meaning: "emf", unit: "V" }, { symbol: "R", meaning: "external resistance", unit: "Ω" }, { symbol: "r", meaning: "internal resistance", unit: "Ω" }], units: "A",
        whenToUse: "Single-loop circuit with a source of internal resistance.", restrictions: "Steady DC.", concepts: ["Terminal voltage"],
      },
    ],
    trick: {
      name: "Millman's shortcut for parallel cells", explanation: "Treat the branches as conductances: the equivalent emf is the conductance-weighted mean of the emfs.",
      whenItWorks: "Parallel cells with like poles together feeding a common load.", whyItWorks: "It is Kirchhoff's junction rule solved for the common node voltage.",
      limitations: "Reverse polarity cells need negative emf terms; non-linear elements break it.", normalMethod: "Write two KVL loops and a KCL equation, then solve three simultaneous equations.",
      shortcutMethod: "$E_{eq}=5$ V, $r_{eq}=0.5\\,\\Omega$, then $I=5/2.5$.", validityCheck: "Full KVL/KCL solution also gives $I = 2$ A through the $2\\,\\Omega$ resistor. ✓",
    },
    mistakes: [
      { category: "sign convention", title: "Treating cells as aiding in series", description: "Adding 6 + 4 = 10 V and 2 Ω in series.", preventionTip: "Check how the poles are joined before choosing series vs parallel formulas." },
      { category: "wrong formula", title: "Averaging the emfs", description: "Taking E_eq = (6+4)/2 only works here because r₁ = r₂.", preventionTip: "Use the conductance-weighted formula so it generalises." },
    ],
    history: [[6, "again"], [6, "hard"], [4, "good"], [0, "good"]], addedDaysAgo: 8,
  },
  {
    text: "A $4\\,\\mu\\text{F}$ capacitor charged to $100\\,\\text{V}$ is connected across an uncharged $6\\,\\mu\\text{F}$ capacitor. Find the loss of energy during the sharing of charge.",
    source: "Sample · Electrostatics set 2",
    s1: { exam: "JEE Main", class: "Class 12", subject: "Physics", unit: "Electricity, Magnetism & Electronics", chapter: "Electrostatics", confidence: { exam: 0.9, class: 0.9, subject: 0.99, unit: 0.97, chapter: 0.98 } },
    s2: {
      subchapter: "Potential and Capacitance", topic: "Energy stored in a capacitor", subtopic: "unknown", concepts: ["Sharing of charge between capacitors", "Energy density"],
      question_type: "Numerical", difficulty: "Hard", difficulty_confidence: 0.65, tags: ["capacitor", "charge-sharing", "energy-loss"],
      confidence: { subchapter: 0.94, topic: 0.9, subtopic: 0.4, concept: 0.9, question_type: 0.95 }, suggestions: {},
    },
    solution: {
      solution_type: "numerical", given: ["$C_1 = 4\\,\\mu$F, $V_1 = 100$ V", "$C_2 = 6\\,\\mu$F, uncharged"], required: "Energy lost $\\Delta U$",
      concept: "Charge is conserved when capacitors are connected; energy is not (it is dissipated).",
      approach: "Find the common potential from charge conservation, then compare initial and final energies.",
      steps: ["$U_i = \\tfrac12 C_1 V_1^2 = \\tfrac12(4\\times10^{-6})(100)^2 = 2\\times10^{-2}\\,\\text{J}$", "$V_c = \\dfrac{C_1V_1}{C_1+C_2} = \\dfrac{400\\,\\mu\\text{C}}{10\\,\\mu\\text{F}} = 40\\,\\text{V}$", "$U_f = \\tfrac12 (C_1+C_2)V_c^2 = \\tfrac12(10\\times10^{-6})(40)^2 = 8\\times10^{-3}\\,\\text{J}$", "$\\Delta U = U_i - U_f = 12\\times10^{-3}\\,\\text{J}$"],
      unit_handling: "Convert μF to F before computing energies.", final_answer: "$\\Delta U = 12\\,\\text{mJ}$",
      verification: "Closed form $\\tfrac12\\frac{C_1C_2}{C_1+C_2}V^2 = \\tfrac12(2.4\\times10^{-6})(10^4)=12$ mJ. ✓", important_points: [], exam_ready_answer: "", assumptions: [], validity_conditions: "Ideal capacitors and wires; the lost energy appears as heat/radiation.",
      hints: ["What is conserved when the capacitors are joined — charge or energy?", "Use conservation of charge to find the common potential, and $U=\\tfrac12CV^2$ for energy.", "Compute $V_c = C_1V_1/(C_1+C_2)$ then compare $U$ before and after."],
    },
    verified: true,
    formulas: [
      { name: "Energy stored in a capacitor", expression: "U = ½ C V²", latex: "U=\\tfrac12 CV^2", variables: [{ symbol: "U", meaning: "stored energy", unit: "J" }, { symbol: "C", meaning: "capacitance", unit: "F" }, { symbol: "V", meaning: "potential difference", unit: "V" }], units: "J", whenToUse: "Energy of a charged capacitor.", restrictions: "", concepts: ["Energy density"] },
      { name: "Common potential after charge sharing", expression: "V = (C1V1 + C2V2)/(C1 + C2)", latex: "V=\\dfrac{C_1V_1+C_2V_2}{C_1+C_2}", variables: [{ symbol: "V", meaning: "common potential", unit: "V" }], units: "V", whenToUse: "Two capacitors joined by like plates.", restrictions: "Like plates joined; opposite plates need signed charges.", concepts: ["Sharing of charge between capacitors"] },
    ],
    trick: {
      name: "Direct energy-loss formula", explanation: "Energy lost equals ½ · (C₁C₂/(C₁+C₂)) · (V₁ − V₂)².", whenItWorks: "Two capacitors joined like-plate to like-plate with no resistance to external sources.",
      whyItWorks: "Subtracting final from initial energy and substituting the common potential simplifies algebraically to this.", limitations: "Valid only for charge sharing between two isolated capacitors.",
      normalMethod: "Find $V_c$, then $U_i$ and $U_f$ and subtract.", shortcutMethod: "$\\Delta U=\\tfrac12\\cdot\\frac{4\\cdot6}{10}\\times10^{-6}\\cdot(100)^2 = 12$ mJ.", validityCheck: "Matches the long method result of 12 mJ. ✓",
    },
    mistakes: [
      { category: "incorrect assumption", title: "Assuming energy is conserved", description: "Setting U_i = U_f to find V.", preventionTip: "Only charge is conserved; energy is lost in the connection." },
      { category: "unit conversion", title: "Leaving μF unconverted", description: "Gives energies off by 10⁶.", preventionTip: "Convert to farads before using ½CV²." },
    ],
    history: [[12, "good"], [8, "easy"], [2, "good"]], addedDaysAgo: 13,
  },
  {
    text: "Evaluate $\\displaystyle\\int_{-\\pi}^{\\pi} \\frac{x^{3}\\cos x}{1+x^{2}}\\,dx$.",
    source: "Sample · Definite integration drill",
    s1: { exam: "JEE Advanced", class: "Class 12", subject: "Mathematics", unit: "Integral Calculus", chapter: "Definite Integration", confidence: { exam: 0.7, class: 0.9, subject: 0.99, unit: 0.98, chapter: 0.99 } },
    s2: {
      subchapter: "Properties of Definite Integrals", topic: "Symmetry/Substitution Property", subtopic: "Even and odd function over symmetric limits", concepts: ["Applying limits and transformation"],
      question_type: "Numerical", difficulty: "Medium", difficulty_confidence: 0.75, tags: ["odd-function", "symmetric-limits"],
      confidence: { subchapter: 0.97, topic: 0.95, subtopic: 0.93, concept: 0.8, question_type: 0.9 }, suggestions: {},
    },
    solution: {
      solution_type: "numerical", given: ["$f(x)=\\dfrac{x^3\\cos x}{1+x^2}$ on $[-\\pi,\\pi]$"], required: "Value of the definite integral",
      concept: "Integrals of odd functions over symmetric limits vanish.",
      approach: "Test the parity of the integrand and use the symmetric-limit property.",
      steps: ["$f(-x)=\\dfrac{(-x)^3\\cos(-x)}{1+x^2}=-\\dfrac{x^3\\cos x}{1+x^2}=-f(x)$, so $f$ is odd.", "$\\displaystyle\\int_{-a}^{a} f(x)\\,dx = 0$ for odd $f$."],
      unit_handling: "", final_answer: "$0$", verification: "Pairing contributions at $x$ and $-x$ gives equal and opposite areas that cancel. ✓", important_points: [], exam_ready_answer: "", assumptions: [], validity_conditions: "Integrand continuous on $[-\\pi,\\pi]$.",
      hints: ["Look at the limits — what do they have in common?", "Check whether the integrand is even or odd.", "$f(-x) = -f(x)$, so apply the odd-function property."],
    },
    verified: true,
    formulas: [{ name: "Integral of an odd function over symmetric limits", expression: "∫_{-a}^{a} f(x) dx = 0 if f(−x) = −f(x)", latex: "\\int_{-a}^{a} f(x)\\,dx = 0 \\;\\text{ if } f(-x)=-f(x)", variables: [{ symbol: "a", meaning: "half-width of the interval", unit: "" }], units: "", whenToUse: "Symmetric limits and an odd integrand.", restrictions: "f must be integrable on [−a, a].", concepts: ["Applying limits and transformation"] }],
    trick: {
      name: "Parity check before integrating", explanation: "Test f(−x) vs f(x) before attempting any antiderivative.", whenItWorks: "Limits of the form −a to a.", whyItWorks: "Odd integrands give cancelling areas on either side of zero.",
      limitations: "Needs exactly symmetric limits; says nothing about the even part.", normalMethod: "Attempt integration by parts/substitution — extremely long here.", shortcutMethod: "Observe oddness → answer 0.", validityCheck: "Both methods must give 0; the parity argument is rigorous. ✓",
    },
    mistakes: [{ category: "algebra mistake", title: "Mislabelling parity", description: "Forgetting that cos x is even while x³ is odd, giving an odd product.", preventionTip: "Odd × even = odd; odd × odd = even." }],
    history: [[7, "easy"], [3, "mastered"]], addedDaysAgo: 8,
  },
  {
    text: "For the reaction $\\text{N}_2(g) + 3\\text{H}_2(g) \\rightleftharpoons 2\\text{NH}_3(g)$, $K_c = 0.5$ (mol/L units) at $400\\,\\text{K}$. Calculate $K_p$ at this temperature. ($R = 0.0821\\,\\text{L atm K}^{-1}\\text{mol}^{-1}$)",
    source: "Sample · Equilibrium practice",
    s1: { exam: "JEE Main", class: "Class 11", subject: "Chemistry", unit: "Physical Chemistry", chapter: "Chemical Equilibrium", confidence: { exam: 0.9, class: 0.75, subject: 0.99, unit: 0.97, chapter: 0.98 } },
    s2: {
      subchapter: "unknown", topic: "Law of mass action and Kc, Kp", subtopic: "unknown", concepts: ["Relation between Kp and Kc"],
      question_type: "Numerical", difficulty: "Medium", difficulty_confidence: 0.7, tags: ["kp-kc", "delta-n"],
      confidence: { subchapter: 0.5, topic: 0.9, subtopic: 0.5, concept: 0.55, question_type: 0.95 }, suggestions: {},
    },
    solution: {
      solution_type: "numerical", given: ["$K_c = 0.5$", "$T = 400$ K", "$R = 0.0821$"], required: "$K_p$",
      concept: "$K_p$ and $K_c$ are related through the change in moles of gas.", approach: "Find $\\Delta n_g$ and apply $K_p = K_c(RT)^{\\Delta n_g}$.",
      steps: ["$\\Delta n_g = 2 - (1+3) = -2$", "$RT = 0.0821\\times400 = 32.84$", "$K_p = 0.5\\times(32.84)^{-2} = \\dfrac{0.5}{1078.5}$", "$K_p \\approx 4.64\\times10^{-4}$"],
      unit_handling: "$R$ in L atm K⁻¹ mol⁻¹ gives $K_p$ with pressure in atm.", final_answer: "$K_p \\approx 4.6\\times10^{-4}\\,\\text{atm}^{-2}$",
      verification: "Δn < 0 so Kp < Kc numerically for RT > 1. ✓", important_points: [], exam_ready_answer: "", assumptions: [], validity_conditions: "Ideal-gas behaviour.",
      hints: ["Which relation connects Kp and Kc?", "$K_p = K_c(RT)^{\\Delta n_g}$ — decide $\\Delta n_g$ from the gas-phase stoichiometry.", "$\\Delta n_g = 2-4 = -2$; compute $RT$ next."],
    },
    verified: true,
    formulas: [{ name: "Relation between Kp and Kc", expression: "Kp = Kc (RT)^Δn", latex: "K_p = K_c (RT)^{\\Delta n_g}", variables: [{ symbol: "Δn_g", meaning: "moles of gaseous products − moles of gaseous reactants", unit: "" }, { symbol: "R", meaning: "gas constant", unit: "L atm K⁻¹ mol⁻¹" }, { symbol: "T", meaning: "temperature", unit: "K" }], units: "", whenToUse: "Gas-phase equilibria.", restrictions: "Kc in mol/L, Kp in atm.", concepts: ["Relation between Kp and Kc"] }],
    mistakes: [
      { category: "wrong formula", title: "Wrong sign of Δn", description: "Using reactants − products gives (RT)^{+2}.", preventionTip: "Δn = products − reactants (gas moles only)." },
      { category: "unit conversion", title: "Using °C", description: "Substituting 127 instead of 400 K.", preventionTip: "Always convert to kelvin." },
    ],
    history: [[4, "hard"]], addedDaysAgo: 5,
  },
];

export const hasSamples = () => getDB().questions.some((q) => q.isSample);

export function loadSamples() {
  const tax = getTax();
  const created: { q: Question; def: SampleDef }[] = [];
  const formulas: Formula[] = [];
  const events: ReviewEvent[] = [];
  const rev: Record<string, ReturnType<typeof simulate>> = {};

  for (const def of SAMPLES) {
    const r1 = resolveStage1(tax, def.s1);
    const res = resolveStage2(tax, r1, def.s2);
    const checked = validateIds(tax, res.ids);
    if (!checked.ok) continue;
    const norm = normalizeQuestionText(def.text);
    if (getDB().questions.some((q) => q.textHash === sha256(norm))) continue;
    const t = D(def.addedDaysAgo).toISOString();
    const q = newQuestion({
      originalText: def.text, normalizedText: norm, textHash: sha256(norm), sourceType: "text", sourceName: def.source, isSample: true,
      processingStatus: "completed", processingStage: "done", ids: checked.ids, difficulty: res.difficulty, difficultyConfidence: res.difficultyConfidence,
      classificationConfidence: res.classificationConfidence, levelConfidence: res.levelConfidence, classificationSource: "ai", reviewReasons: res.reasons,
      suggestions: res.suggestions, needsReview: res.needsReview, solutionStatus: def.verified ? "verified" : "unverified", aiVerified: def.verified,
      hasTrick: Boolean(def.trick), tags: res.tags, createdAt: t, updatedAt: t,
    });
    q.solution = { content: { ...def.solution, answerable: true, issues: "", confidence: 0.9 }, finalAnswer: def.solution.final_answer, verified: def.verified, verificationNotes: def.solution.verification, hints: def.solution.hints, model: "sample-data", createdAt: t };
    q.tricks = def.trick ? [{ id: uid(), ...def.trick }] : [];
    q.mistakes = def.mistakes.map((m) => ({ id: uid(), category: m.category, title: m.title, description: m.description, preventionTip: m.preventionTip }));
    const existing = new Map([...getDB().formulas, ...formulas].map((f) => [f.canonicalKey, f]));
    for (const f of def.formulas) {
      const key = canonicalFormulaKey(f.latex || f.expression);
      let row = existing.get(key);
      if (!row) {
        row = {
          id: uid(), canonicalKey: key, name: f.name, expression: f.expression, latex: f.latex, variables: f.variables, units: f.units, whenToUse: f.whenToUse, restrictions: f.restrictions,
          subjectId: q.ids.subjectId, chapterId: q.ids.chapterId, topicId: q.ids.topicId, subtopicId: q.ids.subtopicId,
          conceptIds: f.concepts.map((n) => tax.byLevel.concept.find((c) => c.name === n && c.a.chapter === q.ids.chapterId)?.id).filter((x): x is number => Boolean(x)), createdAt: t,
        };
        formulas.push(row);
        existing.set(key, row);
      }
      q.formulaIds.push(row.id);
    }
    created.push({ q, def });
    // replay the review history through the real scheduler
    rev[q.id] = simulate(q.id, def, events);
  }

  mutate((d) => {
    d.questions.push(...created.map((c) => c.q));
    d.formulas.push(...formulas);
    d.reviews.push(...events);
    for (const { q, def } of created) {
      const r = rev[q.id];
      d.revision[q.id] = r ?? { questionId: q.id, intervalDays: 1, ease: 2.5, step: 0, repetitions: 0, lapses: 0, status: "new", dueAt: nowIso(), lastRating: null, lastReviewedAt: null };
      d.classEvents.push({ id: uid(), questionId: q.id, kind: "ai", at: q.createdAt, ids: q.ids, difficulty: q.difficulty, confidence: q.levelConfidence, reasons: q.reviewReasons });
      void def;
    }
  });
  return created.length;
}

function simulate(questionId: string, def: SampleDef, events: ReviewEvent[]) {
  let state = { intervalDays: 1, ease: 2.5, step: 0, repetitions: 0, lapses: 0, status: "new" as "new" | "learning" | "review" | "mastered" };
  let dueAt = D(def.addedDaysAgo - 1);
  let last: { rating: Rating; at: Date } | null = null;
  for (const [daysAgo, rating, hints] of [...def.history].sort((a, b) => b[0] - a[0])) {
    const at = D(daysAgo);
    const next = scheduleNext(state, { rating, hintsUsed: hints ?? 0, timeSpentSec: 240 }, at);
    state = { intervalDays: next.intervalDays, ease: next.ease, step: next.step, repetitions: next.repetitions, lapses: next.lapses, status: next.status };
    dueAt = next.dueAt;
    last = { rating, at };
    events.push({ id: uid(), questionId, rating, hintsUsed: hints ?? 0, timeSpentSec: 240, intervalDays: next.intervalDays, dueAt: next.dueAt.toISOString(), at: at.toISOString() });
  }
  return { questionId, ...state, dueAt: dueAt.toISOString(), lastRating: last?.rating ?? null, lastReviewedAt: last?.at.toISOString() ?? null };
}

export function clearSamples() {
  mutate((d) => {
    const ids = new Set(d.questions.filter((q) => q.isSample).map((q) => q.id));
    d.questions = d.questions.filter((q) => !ids.has(q.id));
    for (const id of ids) {
      delete d.revision[id];
      delete d.embeddings[id];
    }
    d.reviews = d.reviews.filter((r) => !ids.has(r.questionId));
    d.classEvents = d.classEvents.filter((r) => !ids.has(r.questionId));
    d.generated = d.generated.filter((g) => !ids.has(g.fromId));
    const used = new Set(d.questions.flatMap((q) => q.formulaIds));
    d.formulas = d.formulas.filter((f) => used.has(f.id));
  });
}
