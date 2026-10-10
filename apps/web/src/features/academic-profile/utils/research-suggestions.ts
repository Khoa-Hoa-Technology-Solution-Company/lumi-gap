type ResearchDomain = { fields: string[]; interests: string[]; skills: string[] };

// These are suggestions for self-declared profiles, never eligibility rules.
const domains: ResearchDomain[] = [
  { fields: ["Computer Science"], interests: ["Human-computer Interaction", "Information Retrieval", "Software Systems"], skills: ["Python", "Machine Learning", "Experimental Design"] },
  { fields: ["Software Engineering"], interests: ["LLM for Software Engineering", "Automated Testing", "Code Review"], skills: ["Python", "Test Automation", "Experimental Design"] },
  { fields: ["Artificial Intelligence"], interests: ["Natural Language Processing", "Computer Vision", "Responsible AI"], skills: ["Python", "Machine Learning", "Model Evaluation"] },
  { fields: ["Data Science"], interests: ["Predictive Analytics", "Data Visualization"], skills: ["Python", "R", "Machine Learning", "Data Visualization"] },
  { fields: ["Information Systems"], interests: ["Digital Transformation", "Human-computer Interaction"], skills: ["Survey Design", "Interview Analysis", "Qualitative Coding"] },
  { fields: ["Cybersecurity"], interests: ["Privacy and Security", "Network Security"], skills: ["Python", "Security Testing", "Experimental Design"] },
  { fields: ["Education"], interests: ["Educational Technology", "Learning Assessment", "Inclusive Education"], skills: ["Survey Design", "Interview Analysis", "Qualitative Coding"] },
  { fields: ["Business and Management", "Business, Management and Accounting", "Economics, Econometrics and Finance", "Decision Sciences"], interests: ["Digital Transformation", "Consumer Behavior", "Economic Policy"], skills: ["Survey Design", "Interview Analysis", "R", "Data Visualization"] },
  { fields: ["Psychology", "Social Sciences"], interests: ["Human Behavior", "Social Inequality"], skills: ["Survey Design", "Interview Analysis", "Qualitative Coding", "Experimental Design"] },
  { fields: ["Arts and Humanities"], interests: ["Cultural Studies", "Digital Humanities"], skills: ["Interview Analysis", "Qualitative Coding", "Archival Research"] },
  { fields: ["Medicine", "Nursing", "Dentistry", "Health Professions", "Neuroscience", "Pharmacology, Toxicology and Pharmaceutics"], interests: ["Public Health", "Clinical Outcomes"], skills: ["Experimental Design", "Evidence Extraction", "R"] },
  { fields: ["Agricultural and Biological Sciences", "Biochemistry, Genetics and Molecular Biology", "Immunology and Microbiology", "Veterinary"], interests: ["Biodiversity", "Molecular Biology"], skills: ["Laboratory Techniques", "Experimental Design", "R"] },
  { fields: ["Chemistry", "Materials Science"], interests: ["Materials Characterization", "Green Chemistry"], skills: ["Laboratory Techniques", "Experimental Design", "Data Visualization"] },
  { fields: ["Physics and Astronomy"], interests: ["Computational Physics", "Astrophysics"], skills: ["Python", "Mathematical Modeling", "Experimental Design"] },
  { fields: ["Engineering", "Energy"], interests: ["Renewable Energy", "Engineering Optimization"], skills: ["Mathematical Modeling", "Simulation", "Experimental Design"] },
  { fields: ["Environmental Science"], interests: ["Sustainable Development", "Climate Change"], skills: ["R", "Geospatial Analysis", "Data Visualization"] },
  { fields: ["Mathematics"], interests: ["Applied Mathematics", "Mathematical Optimization"], skills: ["Mathematical Modeling", "Simulation", "Python"] },
];

const commonInterests = ["Systematic Review", "Interdisciplinary Research"];
const commonSkills = ["Literature Screening", "Data Analysis", "Statistical Analysis", "Academic Writing"];
const topicSkills = new Map<string, string[]>([
  ["Systematic Review", ["Systematic Review", "Literature Screening", "Evidence Extraction"]],
  ["LLM for Software Engineering", ["Python", "Machine Learning", "Model Evaluation"]],
  ["Automated Testing", ["Test Automation"]],
  ["Code Review", ["Qualitative Coding"]],
]);
export const researchInterestOptions = [...new Set([...commonInterests, ...domains.flatMap(domain => domain.interests)])];
export const researchSkillGroups = [
  { label: "Research methods", options: ["Literature Screening", "Evidence Extraction", "Systematic Review", "Survey Design", "Experimental Design", "Interview Analysis", "Qualitative Coding", "Archival Research", "Laboratory Techniques"] },
  { label: "Data and modeling", options: ["Data Analysis", "Statistical Analysis", "Data Visualization", "Machine Learning", "Model Evaluation", "Mathematical Modeling", "Simulation", "Geospatial Analysis"] },
  { label: "Academic communication", options: ["Academic Writing"] },
  { label: "Tools and technical skills", options: ["Python", "R", "Test Automation", "Security Testing"] },
];
export const researchSkillOptions = researchSkillGroups.flatMap(group => group.options);

export function getResearchSuggestions(areas: string[], interests: string[] = []) {
  const fields = new Set(areas.map(area => area.trim().toLowerCase()));
  const relevant = domains.filter(domain => domain.fields.some(field => fields.has(field.toLowerCase())));
  const suggestedSkills = new Set([...commonSkills, ...relevant.flatMap(domain => domain.skills), ...interests.flatMap(interest => {
    const matchingDomain = domains.filter(domain => domain.interests.includes(interest));
    return [...matchingDomain.flatMap(domain => domain.skills), ...(topicSkills.get(interest) ?? [])];
  })]);
  return {
    interests: [...new Set([...relevant.flatMap(domain => domain.interests), ...commonInterests])],
    skillGroups: researchSkillGroups.map(group => ({ ...group, options: group.options.filter(option => suggestedSkills.has(option)) })).filter(group => group.options.length > 0),
  };
}
