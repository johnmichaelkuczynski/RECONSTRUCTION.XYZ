export interface AxiomSet {
  id: string;
  name: string;
  shortName: string;
  description: string;
  content: string;
}

export const axiomLibrary: AxiomSet[] = [
  {
    id: "kva-0",
    name: "Kuczynski-Veblen Axioms 0: Rational Choice Foundations",
    shortName: "KVA-0",
    description: "Foundational axioms for rational choice theory with utility maximization",
    content: `Kuczynski-Veblen Axioms 0: Rational Choice Foundations (KVA-0)

PRIMITIVE TERMS
- C (a set of circumstances or contextual conditions)
- A (a possible action available to an agent)
- U (a utility function mapping pairs of circumstances and actions to real numbers)
- R (the set of real numbers)

AXIOMS
A1. For every circumstance C and every action A, there exists a unique real number r in R such that U(C, A) = r.
A2. For every circumstance C, there exists at least one action A such that U(C, A) is defined.
A3. For every circumstance C, if there are multiple actions A1 and A2 available, then the agent selects an action A* where U(C, A*) >= U(C, A1) and U(C, A*) >= U(C, A2) for all other actions A1, A2.

DEFINED TERMS
D1. Utility Maximization =df The selection of an action A* in circumstance C such that U(C, A*) >= U(C, A) for all other actions A available in C.
D2. Provisioning Strategy =df A mapping from circumstances C to actions A that aims to achieve Utility Maximization.`
  }
];
