export interface Persona {
  id: number;
  style: string;
  risk: string;
  horizon: string;
  temperature: number;
}

// 50 persona seeds — varied across reasoning style, risk posture, time horizon, temperature
// Temperature ranges 0.7–1.05 to drive genuine diversity even within same style
export const PERSONAS: Persona[] = [
  { id: 0,  style: "base-rate analyst",          risk: "cautious",    horizon: "near-term",  temperature: 0.72 },
  { id: 1,  style: "inside-view storyteller",    risk: "aggressive",  horizon: "long-term",  temperature: 0.95 },
  { id: 2,  style: "contrarian skeptic",         risk: "cautious",    horizon: "near-term",  temperature: 0.88 },
  { id: 3,  style: "trend extrapolator",         risk: "moderate",    horizon: "long-term",  temperature: 0.80 },
  { id: 4,  style: "reference-class forecaster", risk: "cautious",    horizon: "mid-term",   temperature: 0.75 },
  { id: 5,  style: "optimistic technologist",    risk: "aggressive",  horizon: "long-term",  temperature: 1.00 },
  { id: 6,  style: "Bayesian updater",           risk: "moderate",    horizon: "near-term",  temperature: 0.78 },
  { id: 7,  style: "macro economist",            risk: "cautious",    horizon: "long-term",  temperature: 0.85 },
  { id: 8,  style: "devil's advocate",           risk: "aggressive",  horizon: "near-term",  temperature: 1.02 },
  { id: 9,  style: "historical parallels finder", risk: "moderate",   horizon: "mid-term",   temperature: 0.82 },
  { id: 10, style: "systems thinker",            risk: "moderate",    horizon: "long-term",  temperature: 0.90 },
  { id: 11, style: "pessimistic risk modeler",   risk: "cautious",    horizon: "near-term",  temperature: 0.76 },
  { id: 12, style: "momentum chaser",            risk: "aggressive",  horizon: "near-term",  temperature: 0.98 },
  { id: 13, style: "structural analyst",         risk: "cautious",    horizon: "long-term",  temperature: 0.74 },
  { id: 14, style: "crowd-wisdom aggregator",    risk: "moderate",    horizon: "mid-term",   temperature: 0.83 },
  { id: 15, style: "contrarian bull",            risk: "aggressive",  horizon: "long-term",  temperature: 1.03 },
  { id: 16, style: "scenario planner",           risk: "moderate",    horizon: "long-term",  temperature: 0.92 },
  { id: 17, style: "calibration expert",         risk: "cautious",    horizon: "mid-term",   temperature: 0.71 },
  { id: 18, style: "narrative forecaster",       risk: "aggressive",  horizon: "near-term",  temperature: 0.99 },
  { id: 19, style: "quantitative modeler",       risk: "cautious",    horizon: "long-term",  temperature: 0.77 },
  { id: 20, style: "geopolitical analyst",       risk: "moderate",    horizon: "long-term",  temperature: 0.86 },
  { id: 21, style: "technology skeptic",         risk: "cautious",    horizon: "near-term",  temperature: 0.89 },
  { id: 22, style: "supply-chain specialist",    risk: "moderate",    horizon: "mid-term",   temperature: 0.81 },
  { id: 23, style: "contrarian bear",            risk: "cautious",    horizon: "near-term",  temperature: 1.01 },
  { id: 24, style: "emerging-markets expert",    risk: "aggressive",  horizon: "long-term",  temperature: 0.97 },
  { id: 25, style: "policy-impact analyst",      risk: "moderate",    horizon: "mid-term",   temperature: 0.84 },
  { id: 26, style: "black-swan hunter",          risk: "aggressive",  horizon: "long-term",  temperature: 1.05 },
  { id: 27, style: "mean-reversion believer",    risk: "cautious",    horizon: "near-term",  temperature: 0.73 },
  { id: 28, style: "consensus tracker",          risk: "moderate",    horizon: "mid-term",   temperature: 0.79 },
  { id: 29, style: "first-principles reasoner",  risk: "moderate",    horizon: "long-term",  temperature: 0.93 },
  { id: 30, style: "expert survey synthesizer",  risk: "cautious",    horizon: "mid-term",   temperature: 0.76 },
  { id: 31, style: "behavioral economist",       risk: "moderate",    horizon: "near-term",  temperature: 0.87 },
  { id: 32, style: "catastrophe modeler",        risk: "cautious",    horizon: "long-term",  temperature: 0.96 },
  { id: 33, style: "innovation optimist",        risk: "aggressive",  horizon: "long-term",  temperature: 1.04 },
  { id: 34, style: "regulatory analyst",         risk: "cautious",    horizon: "mid-term",   temperature: 0.80 },
  { id: 35, style: "momentum skeptic",           risk: "cautious",    horizon: "near-term",  temperature: 0.91 },
  { id: 36, style: "competitive-dynamics expert", risk: "moderate",   horizon: "mid-term",   temperature: 0.85 },
  { id: 37, style: "demographic forecaster",     risk: "cautious",    horizon: "long-term",  temperature: 0.78 },
  { id: 38, style: "incentive-structure analyst", risk: "moderate",   horizon: "long-term",  temperature: 0.94 },
  { id: 39, style: "reflexivity theorist",       risk: "aggressive",  horizon: "near-term",  temperature: 1.02 },
  { id: 40, style: "information aggregator",     risk: "moderate",    horizon: "mid-term",   temperature: 0.83 },
  { id: 41, style: "market-signal reader",       risk: "aggressive",  horizon: "near-term",  temperature: 0.99 },
  { id: 42, style: "second-order thinker",       risk: "moderate",    horizon: "long-term",  temperature: 0.88 },
  { id: 43, style: "empirical minimalist",       risk: "cautious",    horizon: "near-term",  temperature: 0.72 },
  { id: 44, style: "upside-scenario builder",    risk: "aggressive",  horizon: "long-term",  temperature: 1.00 },
  { id: 45, style: "downside-scenario builder",  risk: "cautious",    horizon: "long-term",  temperature: 0.75 },
  { id: 46, style: "volatility specialist",      risk: "moderate",    horizon: "mid-term",   temperature: 0.90 },
  { id: 47, style: "cultural trend analyst",     risk: "moderate",    horizon: "long-term",  temperature: 0.86 },
  { id: 48, style: "frontier-technology scout",  risk: "aggressive",  horizon: "long-term",  temperature: 1.03 },
  { id: 49, style: "probabilistic decision theorist", risk: "cautious", horizon: "mid-term", temperature: 0.79 },
];
