import type { LaTeXDocument } from '../types/editor';

export interface DocumentTemplate {
  id: string;
  name: string;
  topic: string;
  description: string;
  content: string;
}

export const BLANK_DOCUMENT_CONTENT = `\\documentclass{article}
\\title{}
\\author{}
\\date{}

\\begin{document}
\\maketitle

\\section{}

\\end{document}
`;

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'variational-calculus',
    name: 'Variational Calculus & Spectral Analysis',
    topic: 'Pure Mathematics',
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
    topic: 'Linear Algebra',
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
    topic: 'Physics',
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
    id: 'probability-statistics',
    name: 'Probability & Bayesian Inference',
    topic: 'Statistics',
    description: 'Bayes rule, Gaussian likelihoods, conjugate priors, and estimators.',
    content: `\\documentclass{article}
\\title{Bayesian Parameter Estimation \\& Posterior Inference}
\\author{Department of Statistics}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Bayes' Theorem}
Given observed data $\\mathcal{D} = \\{x_1, \\dots, x_n\\}$ and parameter vector $\\theta \\in \\Theta$, the posterior distribution updates prior beliefs via:
\\begin{equation}
p(\\theta \\mid \\mathcal{D}) = \\frac{p(\\mathcal{D} \\mid \\theta)\\, p(\\theta)}{\\int_{\\Theta} p(\\mathcal{D} \\mid \\theta')\\, p(\\theta')\\,\\mathrm{d}\\theta'}
\\end{equation}

\\section{Conjugate Normal-Normal Model}
Suppose $x_i \\sim \\mathcal{N}(\\mu, \\sigma^2)$ with known variance $\\sigma^2$ and prior $\\mu \\sim \\mathcal{N}(\\mu_0, \\tau_0^2)$. The posterior parameters obey:
\\begin{align}
\\frac{1}{\\tau_n^2} &= \\frac{1}{\\tau_0^2} + \\frac{n}{\\sigma^2} \\\\
\\mu_n &= \\tau_n^2 \\left( \\frac{\\mu_0}{\\tau_0^2} + \\frac{n\\bar{x}}{\\sigma^2} \\right)
\\end{align}

\\begin{itemize}
  \\item Posterior mean $\\mu_n$ interpolates between prior mean $\\mu_0$ and sample average $\\bar{x}$.
  \\item As $n \\to \\infty$, posterior variance $\\tau_n^2 \\to 0$ and concentrates around the MLE.
\\end{itemize}

\\end{document}
`,
  },
  {
    id: 'machine-learning',
    name: 'Deep Learning & Attention Mechanics',
    topic: 'Machine Learning',
    description: 'Cross-entropy objectives, gradient updates, and scaled dot-product attention.',
    content: `\\documentclass{article}
\\title{Optimization \\& Self-Attention in Neural Architectures}
\\author{Machine Intelligence Lab}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Scaled Dot-Product Attention}
Given query matrix $Q \\in \\mathbb{R}^{n \\times d_k}$, key matrix $K \\in \\mathbb{R}^{m \\times d_k}$, and value matrix $V \\in \\mathbb{R}^{m \\times d_v}$, attention weights are computed as:
\\begin{equation}
\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\left(\\frac{Q K^\\top}{\\sqrt{d_k}}\\right) V
\\end{equation}

\\section{Empirical Risk & Gradient Updates}
For a mini-batch $\\mathcal{B}$ of size $B$, the cross-entropy loss and momentum update take the form:
\\begin{align}
\\mathcal{L}(\\theta) &= -\\frac{1}{B} \\sum_{(x, y) \\in \\mathcal{B}} \\sum_{c=1}^{C} y_c \\log \\hat{p}_\\theta(c \\mid x) \\\\
v_{t+1} &= \\beta v_t + \\nabla_\\theta \\mathcal{L}(\\theta_t), \\quad \\theta_{t+1} = \\theta_t - \\eta v_{t+1}
\\end{align}

\\end{document}
`,
  },
  {
    id: 'algorithms-complexity',
    name: 'Algorithms & Complexity Analysis',
    topic: 'Computer Science',
    description: 'Master theorem cases, recurrence bounds, and asymptotic runtime table.',
    content: `\\documentclass{article}
\\title{Divide-and-Conquer Recurrences \\& Asymptotic Bounds}
\\author{Algorithms Research Group}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{The Master Theorem}
Let $T(n) = a\\, T(n/b) + f(n)$ with $a \\geq 1$ and $b > 1$. Comparing $f(n)$ against the watershed $n^{\\log_b a}$ gives three regimes:
\\begin{equation}
T(n) = \\begin{cases}
\\Theta(n^{\\log_b a}), & f(n) = O(n^{\\log_b a - \\varepsilon}) \\\\
\\Theta(n^{\\log_b a} \\log n), & f(n) = \\Theta(n^{\\log_b a}) \\\\
\\Theta(f(n)), & f(n) = \\Omega(n^{\\log_b a + \\varepsilon})
\\end{cases}
\\end{equation}

\\section{Common Complexity Benchmarks}
\\begin{center}
\\begin{tabular}{l c r}
\\hline
\\textbf{Algorithm} & \\textbf{Average Time} & \\textbf{Space} \\\\
\\hline
Merge Sort & $O(n \\log n)$ & $O(n)$ \\\\
Binary Search & $O(\\log n)$ & $O(1)$ \\\\
Dijkstra (Binary Heap) & $O((V + E) \\log V)$ & $O(V)$ \\\\
\\hline
\\end{tabular}
\\end{center}

\\end{document}
`,
  },
  {
    id: 'organic-thermodynamics',
    name: 'Chemical Thermodynamics & Kinetics',
    topic: 'Chemistry',
    description: 'Gibbs free energy, equilibrium constants, and Arrhenius reaction rates.',
    content: `\\documentclass{article}
\\title{Thermodynamic Equilibrium \\& Reaction Kinetics}
\\author{Physical Chemistry Division}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Gibbs Free Energy & Equilibrium}
At constant temperature $T$ and pressure $P$, spontaneity of a chemical process is governed by the change in Gibbs free energy $\\Delta G$:
\\begin{align}
\\Delta G &= \\Delta H - T \\Delta S \\\\
\\Delta G^\\circ &= -R T \\ln K_{\\mathrm{eq}}
\\end{align}
where $R = 8.314\\,\\mathrm{J\\,mol^{-1}\\,K^{-1}}$ is the universal gas constant.

\\section{Arrhenius Rate Law}
The temperature dependence of the forward rate constant $k(T)$ follows:
\\begin{equation}
k(T) = A \\exp\\left( -\\frac{E_a}{R T} \\right)
\\end{equation}

\\begin{itemize}
  \\item $\\Delta G < 0$: exergonic and thermodynamically favorable.
  \\item Lowering activation energy $E_a$ via catalysis increases $k(T)$ exponentially.
\\end{itemize}

\\end{document}
`,
  },
  {
    id: 'macroeconomics-game-theory',
    name: 'Game Theory & Macroeconomic Growth',
    topic: 'Economics',
    description: 'Nash equilibrium, Solow-Swan growth dynamics, and consumer utility.',
    content: `\\documentclass{article}
\\title{Strategic Equilibria \\& Dynamic Growth Models}
\\author{Quantitative Economics Review}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Nash Equilibrium Condition}
In a finite $N$-player game with strategy profiles $s = (s_i, s_{-i})$, a profile $s^*$ is a Nash equilibrium if no player gains by unilateral deviation:
\\begin{equation}
u_i(s_i^*, s_{-i}^*) \\geq u_i(s_i, s_{-i}^*) \\quad \\forall s_i \\in S_i, \\; \\forall i \\in \\{1, \\dots, N\\}
\\end{equation}

\\section{Solow--Swan Capital Accumulation}
With savings rate $s \\in (0, 1)$, depreciation $\\delta$, and labor growth rate $n$, capital per worker $k_t$ evolves via:
\\begin{equation}
\\dot{k} = s f(k) - (n + \\delta) k
\\end{equation}
Steady-state equilibrium $k^*$ occurs where $s f(k^*) = (n + \\delta) k^*$.

\\end{document}
`,
  },
  {
    id: 'signal-processing',
    name: 'Signal Processing & Fourier Analysis',
    topic: 'Engineering',
    description: 'Fourier transforms, Nyquist sampling, Parseval identity, and convolutions.',
    content: `\\documentclass{article}
\\title{Continuous \\& Discrete Fourier Methods in Signal Processing}
\\author{Communications Engineering Group}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Fourier Transform Pair}
For an integrable signal $x(t) \\in L^1(\\mathbb{R})$, its frequency spectrum $X(\\omega)$ and synthesis integral are given by:
\\begin{align}
X(\\omega) &= \\int_{-\\infty}^{\\infty} x(t)\\, e^{-i \\omega t}\\,\\mathrm{d}t \\\\
x(t) &= \\frac{1}{2\\pi} \\int_{-\\infty}^{\\infty} X(\\omega)\\, e^{i \\omega t}\\,\\mathrm{d}\\omega
\\end{align}

\\section{Parseval's Energy Identity}
Total signal energy is preserved between the time and frequency domains:
\\begin{equation}
\\int_{-\\infty}^{\\infty} |x(t)|^2 \\,\\mathrm{d}t = \\frac{1}{2\\pi} \\int_{-\\infty}^{\\infty} |X(\\omega)|^2 \\,\\mathrm{d}\\omega
\\end{equation}

\\end{document}
`,
  },
  {
    id: 'computational-biology',
    name: 'Enzyme Kinetics & Population Dynamics',
    topic: 'Biology',
    description: 'Michaelis-Menten rate law, logistic growth, and Lotka-Volterra systems.',
    content: `\\documentclass{article}
\\title{Mathematical Models in Cellular \\& Population Biology}
\\author{Systems Biology Institute}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Michaelis--Menten Enzyme Kinetics}
The initial reaction velocity $v_0$ as a function of substrate concentration $[S]$ obeys:
\\begin{equation}
v_0 = \\frac{V_{\\max} [S]}{K_m + [S]}
\\end{equation}
where $K_m$ denotes the substrate concentration at half-maximal velocity $\\frac{1}{2} V_{\\max}$.

\\section{Predator--Prey Dynamics}
The Lotka--Volterra coupled differential system describes prey $x(t)$ and predator $y(t)$ populations:
\\begin{align}
\\frac{\\mathrm{d}x}{\\mathrm{d}t} &= \\alpha x - \\beta x y \\\\
\\frac{\\mathrm{d}y}{\\mathrm{d}t} &= \\delta x y - \\gamma y
\\end{align}

\\end{document}
`,
  },
  {
    id: 'academic-cv',
    name: 'Academic Curriculum Vitae & Resume',
    topic: 'Career & CV',
    description: 'Structured CV with Education, Research Experience, Publications, and Skills.',
    content: `\\documentclass{article}
\\title{Jordan Mercer — Curriculum Vitae}
\\author{jordan.mercer@university.edu · Cambridge, MA}
\\date{Updated November 2026}

\\begin{document}
\\maketitle

\\section{Education}
\\begin{itemize}
  \\item \\textbf{Ph.D. in Computational Science}, Massachusetts Institute — Expected 2027. Focus on numerical PDEs and scientific computing.
  \\item \\textbf{B.S. in Mathematics \\& Physics}, State University — 2022, Summa Cum Laude.
\\end{itemize}

\\section{Research Experience}
\\subsection{Graduate Research Fellow (2023--Present)}
Developed finite-element solvers for coupled fluid-structure interactions, achieving $3.4\\times$ speedup on multi-GPU clusters.

\\section{Selected Publications}
\\begin{enumerate}
  \\item J. Mercer and E. Vance, \\emph{Adaptive Mesh Refinement for Spectral Operators}, Journal of Computational Physics, 2025.
  \\item J. Mercer, \\emph{Preconditioned Krylov Solvers on Curved Domains}, SIAM Scientific Computing, 2024.
\\end{enumerate}

\\section{Technical Skills}
\\textbf{Languages:} TypeScript, Python, C++, Julia · \\textbf{Tools:} LaTeX, PyTorch, MPI, Git.

\\end{document}
`,
  },
  {
    id: 'homework-problem-set',
    name: 'Homework & Problem Set Sheet',
    topic: 'Education',
    description: 'Formatted assignment with numbered problems, subparts, and proof boxes.',
    content: `\\documentclass{article}
\\title{MATH 301 — Problem Set 4}
\\author{Student Name: Alex Rivera · ID: 402918}
\\date{Due Date: \\today}

\\begin{document}
\\maketitle

\\section{Problem 1: Series Convergence}
Determine whether the infinite series converges or diverges:
\\[
\\sum_{n=1}^{\\infty} \\frac{n^2 + 1}{2^n}
\\]

\\subsection{Solution}
Applying the Ratio Test with $a_n = \\frac{n^2 + 1}{2^n}$:
\\begin{align}
L &= \\lim_{n \\to \\infty} \\left| \\frac{a_{n+1}}{a_n} \\right| = \\lim_{n \\to \\infty} \\frac{(n+1)^2 + 1}{2(n^2 + 1)} = \\frac{1}{2} < 1
\\end{align}
Since $L < 1$, the series converges absolutely.

\\section{Problem 2: Eigenvalues of Symmetric Matrices}
Show that all eigenvalues of a real symmetric matrix $A = A^\\top$ are real.

\\begin{proof}
Suppose $Av = \\lambda v$ with $v \\neq 0$. Taking the Hermitian inner product gives $\\lambda \\langle v, v \\rangle = \\langle Av, v \\rangle = \\langle v, A^\\top v \\rangle = \\overline{\\lambda} \\langle v, v \\rangle$, hence $\\lambda = \\overline{\\lambda} \\in \\mathbb{R}$.
\\end{proof}

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
