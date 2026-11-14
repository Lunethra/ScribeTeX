import type { LaTeXDocument } from '../types/editor';

export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'variational-calculus',
    name: 'Variational Calculus & Spectral Analysis',
    description: 'Academic paper with theorems, proofs, aligned equations, and tables.',
    content: `\\documentclass[11pt,a4paper]{article}
\\title{Variational Principles in Spectral Geometry}
\\author{Dr. Elena Vance \\and Marcus Thorne}
\\date{\\today}

\\newcommand{\\R}{\\mathbb{R}}
\\newcommand{\\norm}[1]{\\left\\| #1 \\right\\|}
\\newcommand{\\inner}[2]{\\langle #1, #2 \\rangle}

\\begin{document}

\\maketitle

\\begin{abstract}
We establish sharp lower bounds on the first Dirichlet eigenvalue of the Laplace--Beltrami operator over compact Riemannian manifolds with convex boundary. Using a refined Bochner identity and custom variational test functions, we connect spectral gaps directly to Ricci curvature tensors.
\\end{abstract}

\\tableofcontents

\\section{Introduction and Preliminaries}
Let $(M, g)$ denote a smooth, compact $n$-dimensional Riemannian manifold with smooth boundary $\\partial M$. Consider the classical Rayleigh quotient associated with a smooth function $u \\in C_0^\\infty(M)$:
\\begin{equation}\\label{eq:rayleigh}
\\lambda_1(M) = \\inf_{u \\neq 0} \\frac{\\int_M |\\nabla u|^2 \\, \\mathrm{d}V_g}{\\int_M |u|^2 \\, \\mathrm{d}V_g}
\\end{equation}

In Equation~\\eqref{eq:rayleigh}, the infimum is achieved by a strictly positive eigenfunction satisfying $-\\Delta u = \\lambda_1 u$ in $M$ with $u = 0$ on $\\partial M$.

\\begin{definition}[Spectral Gap]
Given eigenvalues $0 < \\lambda_1 < \\lambda_2 \\leq \\lambda_3 \\leq \\cdots$, the \\emph{fundamental spectral gap} is defined as $\\Gamma(M) \\coloneqq \\lambda_2(M) - \\lambda_1(M)$.
\\end{definition}

\\section{Main Variational Estimates}

\\subsection{Bochner--Reilly Formulation}
For any smooth function $f \\in C^\\infty(M)$, the integrated Reilly formula relates the Hessian norm $\\|\\nabla^2 f\\|_{HS}^2$ to boundary curvature terms:
\\begin{align}
\\int_M \\left( (\\Delta f)^2 - |\\nabla^2 f|^2 - \\mathrm{Ric}(\\nabla f, \\nabla f) \\right) \\mathrm{d}V_g &= \\int_{\\partial M} \\mathcal{B}(f) \\, \\mathrm{d}A_g \\\\
\\mathcal{B}(f) &= 2 \\frac{\\partial f}{\\partial \\nu} \\Delta_{\\partial M} f + H \\left( \\frac{\\partial f}{\\partial \\nu} \\right)^2
\\end{align}

\\begin{theorem}[Lichnerowicz--Obata Type Bound]
Suppose $\\mathrm{Ric}_M \\geq (n - 1)\\kappa g$ for some $\\kappa > 0$ and $\\partial M$ is mean-convex ($H \\geq 0$). Then the first Dirichlet eigenvalue satisfies:
\\[
\\lambda_1(M) \\geq n\\kappa + \\frac{\\pi^2}{D^2}
\\]
where $D = \\mathrm{diam}(M)$ denotes the intrinsic diameter.
\\end{theorem}

\\begin{proof}
Applying the Reilly identity to the first eigenfunction $u$ with $u|_{\\partial M} = 0$, the tangential Laplacian $\\Delta_{\\partial M} u$ vanishes identically. Using Cauchy--Schwarz on the Hessian trace $|\\nabla^2 u|^2 \\geq \\frac{1}{n}(\\Delta u)^2$ yields the desired lower bound.
\\end{proof}

\\section{Numerical Comparison Across Manifolds}

We benchmark three canonical geometries in dimension $n = 3$ using finite-element discretization:

\\begin{center}
\\begin{tabular}{l c c r}
\\hline
\\textbf{Geometry} & \\textbf{Curvature $\\kappa$} & \\textbf{Theoretical Bound} & \\textbf{Computed $\\lambda_1$} \\\\
\\hline
Unit Euclidean Ball $B^3$ & $0.00$ & $\\pi^2 \\approx 9.8696$ & $9.8696$ \\\\
Hemisphere $\\mathbb{S}^3_+$ & $+1.00$ & $3.0000$ & $3.0000$ \\\\
Ellipsoid ($a=1, b=1.5$) & $+0.44$ & $6.4120$ & $7.1842$ \\\\
\\hline
\\end{tabular}
\\end{center}

\\subsection{Key Takeaways}
\\begin{itemize}
  \\item Curvature lower bounds tightly constrain the fundamental frequency $\\lambda_1$.
  \\item Boundary mean convexity eliminates negative boundary contributions in $\\mathcal{B}(f)$.
  \\item Custom macros such as $\\norm{u}$ and $\\inner{u}{v}$ compile seamlessly in real time.
\\end{itemize}

\\end{document}
`,
  },
  {
    id: 'linear-algebra',
    name: 'Linear Algebra & Matrix Decomposition',
    description: 'Matrix notations, SVD, eigenvalues, and piecewise functions.',
    content: `\\documentclass{article}
\\title{Singular Value Decomposition \\& Matrix Norms}
\\author{Applied Mathematics Notes}
\\date{November 2026}

\\begin{document}
\\maketitle

\\section{The Singular Value Theorem}
Every real matrix $A \\in \\mathbb{R}^{m \\times n}$ admits a factorization of the form
\\[
A = U \\Sigma V^\\top
\\]
where $U \\in \\mathbb{R}^{m \\times m}$ and $V \\in \\mathbb{R}^{n \\times n}$ are orthogonal matrices, and $\\Sigma \\in \\mathbb{R}^{m \\times n}$ is rectangular diagonal:
\\[
\\Sigma = \\begin{bmatrix}
\\sigma_1 & 0 & \\cdots & 0 \\\\
0 & \\sigma_2 & \\cdots & 0 \\\\
\\vdots & \\vdots & \\ddots & \\vdots \\\\
0 & 0 & \\cdots & \\sigma_r
\\end{bmatrix}
\\]

\\section{Soft-Thresholding Operator}
In low-rank matrix recovery, singular values are shrunk via the proximal operator $\\mathcal{D}_\\tau(\\sigma)$:
\\begin{equation}
\\mathcal{D}_\\tau(\\sigma_i) = \\begin{cases}
\\sigma_i - \\tau, & \\text{if } \\sigma_i > \\tau \\\\
0, & \\text{if } \\sigma_i \\leq \\tau
\\end{cases}
\\end{equation}

\\begin{enumerate}
  \\item \\textbf{Frobenius Norm:} $\\|A\\|_F = \\sqrt{\\sum_{i=1}^r \\sigma_i^2}$.
  \\item \\textbf{Spectral Norm:} $\\|A\\|_2 = \\sigma_1(A)$.
  \\item \\textbf{Nuclear Norm:} $\\|A\\|_* = \\sum_{i=1}^r \\sigma_i$.
\\end{enumerate}

\\end{document}
`,
  },
  {
    id: 'physics-quantum',
    name: 'Quantum Mechanics & Electrodynamics',
    description: 'Dirac bra-ket notation, Maxwell equations, and Schrödinger wave equation.',
    content: `\\documentclass{article}
\\title{Foundations of Quantum Dynamics}
\\author{Theoretical Physics Collective}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Time-Dependent Schr\\"{o}dinger Equation}
The state vector $|\\psi(t)\\rangle \\in \\mathcal{H}$ evolves unitarily under the Hamiltonian operator $\\hat{H}$:
\\begin{equation}
i\\hbar \\frac{\\partial}{\\partial t}|\\psi(t)\\rangle = \\hat{H}|\\psi(t)\\rangle = \\left( -\\frac{\\hbar^2}{2m}\\nabla^2 + V(\\mathbf{r}, t) \\right)|\\psi(t)\\rangle
\\end{equation}

\\section{Maxwell's Equations in Differential Form}
\\begin{align}
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\nabla \\cdot \\mathbf{B} &= 0 \\\\
\\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{align}

\\begin{remark}
In natural units ($\\hbar = c = 1$), the fine-structure constant is $\\alpha = \\frac{e^2}{4\\pi\\varepsilon_0} \\approx \\frac{1}{137}$.
\\end{remark}

\\end{document}
`,
  },
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Start fresh with a basic empty header and base section.',
    content: `\\documentclass{article}
\\title{}
\\author{}
\\date{}

\\begin{document}
\\maketitle

\\section{}

\\end{document}
`,
  },
];

export const DEFAULT_DOCUMENTS: LaTeXDocument[] = [
  {
    id: 'doc-1',
    title: 'Variational Principles.tex',
    content: DOCUMENT_TEMPLATES[0].content,
    updatedAt: Date.now(),
  },
  {
    id: 'doc-2',
    title: 'Matrix Decompositions.tex',
    content: DOCUMENT_TEMPLATES[1].content,
    updatedAt: Date.now() - 3600_000,
  },
];
