/**
 * Synonym groups for relevance filtering of systematic review searches.
 *
 * Each group is an array of interchangeable terms. When the relevance filter
 * checks whether a concept appears in a review's title/abstract, it expands
 * the concept to its full synonym group and accepts a match on any member.
 *
 * Scope: medical/research terminology most likely to appear in systematic
 * review titles and abstracts. Covers age groups, common conditions,
 * interventions, outcomes, and common abbreviations.
 */
const SYNONYM_GROUPS: string[][] = [
  // ── Age / population ────────────────────────────────────────────────────
  [
    "adolescent", "adolescents", "adolescence",
    "teenager", "teenagers", "teen", "teens",
    "youth", "youths",
    "juvenile", "juveniles",
    "young people", "young person",
    "young adult", "young adults",
  ],
  [
    "child", "children", "childhood",
    "pediatric", "paediatric",
    "infant", "infants", "neonatal", "neonate", "neonates",
    "toddler", "toddlers",
  ],
  [
    "elderly", "older adult", "older adults", "older people", "older person",
    "geriatric", "geriatrics",
    "senior", "seniors",
    "aging", "ageing",
    "aged",
  ],

  // ── Mental health conditions ─────────────────────────────────────────────
  [
    "depression", "depressive disorder", "major depressive disorder",
    "major depression", "MDD", "depressive symptoms", "depressive episode",
    "unipolar depression",
  ],
  [
    "anxiety", "anxiety disorder", "anxious", "anxiety disorders",
    "generalized anxiety disorder", "GAD",
    "social anxiety", "social anxiety disorder",
  ],
  [
    "PTSD", "post-traumatic stress disorder", "posttraumatic stress disorder",
    "post traumatic stress", "trauma-related disorder",
  ],
  [
    "ADHD", "attention deficit hyperactivity disorder",
    "attention-deficit/hyperactivity disorder",
    "attention deficit disorder", "ADD",
  ],
  [
    "autism", "autism spectrum disorder", "ASD",
    "autistic", "autistic spectrum",
  ],
  [
    "schizophrenia", "psychosis", "psychotic disorder",
    "schizoaffective disorder", "psychotic",
  ],
  [
    "bipolar", "bipolar disorder", "bipolar affective disorder",
    "manic depression", "mania", "manic episode",
  ],
  [
    "OCD", "obsessive-compulsive disorder", "obsessive compulsive disorder",
  ],
  [
    "eating disorder", "anorexia", "anorexia nervosa",
    "bulimia", "bulimia nervosa", "binge eating disorder",
  ],

  // ── Neurological / cognitive conditions ──────────────────────────────────
  [
    "dementia", "Alzheimer's", "Alzheimer's disease",
    "cognitive decline", "cognitive impairment", "neurocognitive disorder",
    "vascular dementia",
  ],
  [
    "insomnia", "sleep disorder", "sleep disturbance", "sleep problems",
    "sleep difficulty", "sleep difficulties", "sleep deprivation",
  ],
  [
    "chronic pain", "pain", "pain management", "pain intensity",
    "neuropathic pain", "musculoskeletal pain",
  ],
  [
    "addiction", "substance use disorder", "substance abuse",
    "drug addiction", "alcohol use disorder", "dependence",
  ],

  // ── Physical health conditions ───────────────────────────────────────────
  [
    "diabetes", "diabetes mellitus", "diabetic",
    "type 2 diabetes", "T2DM", "type 1 diabetes", "T1DM",
  ],
  [
    "hypertension", "high blood pressure",
    "elevated blood pressure", "arterial hypertension",
  ],
  [
    "obesity", "overweight", "obese", "adiposity",
    "excess weight", "weight gain",
  ],
  [
    "cancer", "neoplasm", "tumour", "tumor",
    "malignancy", "carcinoma", "oncology", "oncological",
    "malignant", "neoplastic",
  ],
  [
    "stroke", "cerebrovascular accident", "CVA",
    "ischaemic stroke", "ischemic stroke", "haemorrhagic stroke",
    "hemorrhagic stroke", "cerebral infarction",
  ],
  [
    "cardiovascular disease", "heart disease", "coronary artery disease",
    "cardiac disease", "heart failure", "myocardial infarction",
    "coronary heart disease", "CVD",
  ],
  [
    "asthma", "bronchial asthma", "asthmatic",
  ],
  [
    "COPD", "chronic obstructive pulmonary disease",
    "chronic bronchitis", "emphysema",
  ],

  // ── Interventions ────────────────────────────────────────────────────────
  [
    "cognitive behavioral therapy", "cognitive behavioural therapy",
    "CBT", "cognitive behavior therapy", "cognitive behaviour therapy",
    "cognitive behavioral treatment", "cognitive behavioural treatment",
  ],
  [
    "mindfulness", "mindfulness-based",
    "MBSR", "mindfulness-based stress reduction",
    "mindfulness-based cognitive therapy", "MBCT",
    "meditation",
  ],
  [
    "exercise", "physical activity", "physical exercise",
    "aerobic exercise", "aerobic", "resistance training",
    "strength training", "physical training",
  ],
  [
    "psychotherapy", "psychological therapy", "psychological treatment",
    "talking therapy", "counselling", "counseling",
    "psychosocial intervention", "psychosocial treatment",
  ],
  [
    "surgery", "surgical", "surgical intervention",
    "operative", "operation",
  ],
  [
    "medication", "drug therapy", "pharmacotherapy",
    "pharmacological", "pharmacological treatment",
    "drug treatment", "drug intervention",
  ],
  [
    "antidepressant", "antidepressants",
    "SSRI", "SSRIs", "selective serotonin reuptake inhibitor",
    "SNRI", "SNRIs", "serotonin-norepinephrine reuptake inhibitor",
    "tricyclic antidepressant",
  ],
  [
    "psilocybin", "psilocin",
    "magic mushroom", "psychedelic mushroom",
    "psychedelic", "psychedelics",
    "psychedelic-assisted therapy", "psychedelic-assisted psychotherapy",
  ],
  [
    "ketamine", "esketamine",
    "ketamine infusion", "ketamine therapy",
  ],
  [
    "MDMA", "3,4-methylenedioxymethamphetamine",
    "MDMA-assisted therapy", "ecstasy",
  ],
  [
    "acupuncture", "acupressure",
  ],
  [
    "telehealth", "telemedicine", "remote care",
    "digital health", "eHealth", "mHealth",
    "internet-based", "online intervention",
  ],

  // ── Outcomes ─────────────────────────────────────────────────────────────
  [
    "quality of life", "QoL", "health-related quality of life", "HRQoL",
    "wellbeing", "well-being", "health-related wellbeing",
  ],
  [
    "mortality", "death", "survival", "survival rate",
    "all-cause mortality", "case fatality",
  ],
  [
    "adherence", "compliance", "medication adherence",
    "treatment adherence",
  ],
  [
    "relapse", "recurrence", "remission",
  ],
];

/**
 * A flat Map from lowercase term → all synonyms in its group (lowercase).
 * Built once at module load.
 */
const SYNONYM_MAP: Map<string, string[]> = new Map();
for (const group of SYNONYM_GROUPS) {
  const lowerGroup = group.map((t) => t.toLowerCase());
  for (const term of lowerGroup) {
    SYNONYM_MAP.set(term, lowerGroup);
  }
}

/**
 * Expands a query concept to its full synonym group.
 * Returns an array of lowercase synonyms (including the original term).
 * Falls back to `[concept]` when no synonym group is found.
 */
export function expandConcept(concept: string): string[] {
  const lower = concept.toLowerCase().trim();
  return SYNONYM_MAP.get(lower) ?? [lower];
}
