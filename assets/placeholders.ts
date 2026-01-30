
// Curated high-quality scientific and educational placeholder images
export const SUBJECT_PLACEHOLDERS = {
  PHYSICS: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=2000&auto=format&fit=crop", // Quantum / Abstract Physics
  BIOLOGY: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?q=80&w=2000&auto=format&fit=crop", // DNA / Microbiology
  CHEMISTRY: "https://images.unsplash.com/photo-1532187875605-186482a635c2?q=80&w=2000&auto=format&fit=crop", // Laboratory / Chemistry
  MATHEMATICS: "https://images.unsplash.com/photo-1509228468518-180dd4864904?q=80&w=2000&auto=format&fit=crop", // Chalkboard / Formulas
  ASTRONOMY: "https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=2000&auto=format&fit=crop", // Deep Space / Galaxies
  GENERAL: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2000&auto=format&fit=crop" // Technology / Digital Learning
};

export const getRandomPlaceholder = () => {
  const keys = Object.keys(SUBJECT_PLACEHOLDERS);
  // Exclude 'GENERAL' from the random pick to prefer the more specific scientific ones
  const filteredKeys = keys.filter(k => k !== 'GENERAL');
  const randomKey = filteredKeys[Math.floor(Math.random() * filteredKeys.length)];
  return SUBJECT_PLACEHOLDERS[randomKey as keyof typeof SUBJECT_PLACEHOLDERS];
};
