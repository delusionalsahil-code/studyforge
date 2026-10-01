/** Default JEE taxonomy DSL (initial data only; afterwards the stored taxonomy is the source of truth).
 * Markers: # subject, U unit, C chapter, S subchapter, T topic, ST subtopic, K concept; ";" separates siblings. */
export const JEE_SEED = `
# Physics
U Mechanics
C Units, Dimensions & Measurement
T Dimensional analysis; Significant figures and errors; Units and dimensions of physical quantities
K Dimensional formula; Principle of homogeneity; Least count and error propagation
C Kinematics
S Motion in One Dimension
T Equations of motion; Free fall; Relative motion in one dimension; Graphs of motion
K Uniformly accelerated motion; Velocity-time graph area; Variable acceleration using calculus
S Motion in Two Dimensions
T Projectile motion; Relative velocity (river-boat and rain-man); Projectile on an incline
K Time of flight, range and maximum height; Minimum time and shortest path crossing
C Laws of Motion
S Newton's Laws
T Free body diagrams; Constraint motion and pulleys; Pseudo force and non-inertial frames
K Newton's second law application; String constraint relation; Pseudo force in accelerating frame
S Friction
T Static and kinetic friction; Motion on rough inclines; Blocks in contact with friction
K Angle of repose; Limiting friction
C Work, Energy & Power
T Work done by constant and variable force; Work-energy theorem; Conservative forces and potential energy; Power; Collisions in one and two dimensions
K Work-energy theorem application; Potential energy curve; Coefficient of restitution; Elastic and inelastic collisions
C Circular Motion
T Uniform circular motion; Non-uniform circular motion; Banking of roads; Vertical circle
K Centripetal acceleration; Critical speed at top of vertical circle; Conical pendulum
C Centre of Mass & Linear Momentum
T Centre of mass of systems and bodies; Conservation of linear momentum; Variable mass systems; Impulse
K Centre of mass of continuous bodies; Rocket propulsion; Impulse-momentum theorem
C Rotational Motion
S Rigid Body Kinematics and Dynamics
T Moment of inertia
ST Parallel and perpendicular axis theorems
T Torque and angular momentum; Rolling motion; Conservation of angular momentum
K Moment of inertia of standard bodies; Rolling without slipping; Torque equation; Angular impulse
C Gravitation
T Newton's law of gravitation; Gravitational field and potential; Escape velocity and orbital velocity; Kepler's laws; Satellite motion
K Variation of g with height and depth; Gravitational potential energy; Binding energy of satellite
U Properties of Matter & Thermal Physics
C Properties of Solids and Liquids
S Elasticity
T Stress, strain and Young's modulus; Elastic potential energy; Bulk and shear modulus
S Fluid Mechanics
T Pressure and Pascal's law; Buoyancy; Equation of continuity and Bernoulli's theorem; Viscosity and terminal velocity; Surface tension and capillarity
K Hydrostatic pressure; Archimedes principle; Torricelli's theorem; Stokes' law; Excess pressure in drops and bubbles
C Thermal Properties of Matter
T Thermal expansion; Calorimetry; Heat transfer: conduction, convection, radiation; Newton's law of cooling; Wien's and Stefan's law
K Linear and volume expansion; Specific heat and latent heat; Thermal resistance; Black body radiation
C Thermodynamics
S Kinetic Theory of Gases
T Ideal gas equation; Degrees of freedom and equipartition; RMS and average speed; Mean free path
S Laws of Thermodynamics
T First law of thermodynamics; Heat engines and refrigerators; Second law and Carnot cycle
T Thermodynamic processes
ST Work done in isothermal and adiabatic process
K Molar heat capacities Cp and Cv; Efficiency of Carnot engine; PV diagram analysis
U Oscillations & Waves
C Simple Harmonic Motion
T Equation of SHM; Energy in SHM; Spring-mass system; Simple and physical pendulum; Superposition of SHM
K Time period of spring combinations; Phase and phase difference; Damped and forced oscillations
C Waves
S Mechanical Waves
T Wave equation and speed of wave; Superposition and interference; Standing waves in strings; Standing waves in organ pipes; Beats; Doppler effect; Sound intensity
K Speed of transverse wave on a string; Resonance in open and closed pipes; Beat frequency; Doppler shift with moving source and observer
U Electricity, Magnetism & Electronics
C Electrostatics
S Electric Charge and Field
T Coulomb's law; Electric field of charge distributions; Electric dipole; Gauss's law
K Quantisation and conservation of charge; Field of line, ring and disc; Dipole in uniform field; Flux through closed surface
S Potential and Capacitance
T Electric potential and potential energy; Conductors in electrostatics; Capacitors and combinations; Dielectrics; Energy stored in a capacitor
K Potential due to point charge and dipole; Equipotential surfaces; Capacitance of parallel plate capacitor; Energy density; Sharing of charge between capacitors; Capacitor with dielectric slab
C Current Electricity
S Electric Current and Drift
T Electric current and current density
K Definition of electric current; Current density
T Drift velocity and mobility
ST Drift velocity derivation
K Relaxation time; Mobility
S Electrical Resistance
T Ohm's law
K Ohmic and non-ohmic conductors
T Resistivity and Conductivity
ST Temperature Dependence of Resistance
K Concept of resistance variation with temperature; Temperature coefficient of resistance
ST Stretching and Shape Dependence of Resistance
K Resistance after stretching a wire
T Combination of resistors
K Series and parallel combination; Equivalent resistance of symmetric networks
S Cells and EMF
T EMF and internal resistance; Combination of cells
K Terminal voltage; Maximum power transfer; Series and parallel grouping of cells
S Kirchhoff's Laws and Network Analysis
T Kirchhoff's current law; Kirchhoff's voltage law; Wheatstone bridge and Meter bridge; Potentiometer
K Junction rule; Loop rule; Balanced bridge condition; Comparison of EMFs using potentiometer
S Heating Effect of Current
T Electrical power and energy; Joule's heating and fuse
K Power dissipated in resistor; Heat produced in a conductor
S Measuring Instruments
T Galvanometer, ammeter and voltmeter
K Conversion of galvanometer to ammeter or voltmeter
C Magnetic Effects of Current and Magnetism
T Biot-Savart law; Ampere's circuital law; Motion of charge in magnetic field; Force on current-carrying conductor; Torque on current loop and moving coil galvanometer; Magnetic properties of materials; Bar magnet and Earth's magnetism
K Field of straight wire, loop and solenoid; Cyclotron; Force between parallel wires; Magnetic dipole moment; Hysteresis; Dia-, para- and ferromagnetism
C Electromagnetic Induction and AC
S Electromagnetic Induction
T Faraday's and Lenz's law; Motional EMF; Self and mutual inductance; Eddy currents
K Induced EMF in rotating rod; Energy stored in inductor; LR circuit growth and decay
S Alternating Current
T AC circuits and phasors; LCR series circuit and resonance; Power in AC circuit; Transformer
K Reactance and impedance; Resonant frequency and Q factor; Power factor; RMS value of AC
C Electromagnetic Waves
T Displacement current; Electromagnetic spectrum; Properties of EM waves
K Maxwell's equations overview; Relation between E and B in EM wave
C Semiconductors and Electronic Devices
T Energy bands; p-n junction diode; Rectifiers and Zener diode; Transistors and amplifiers; Logic gates
K Intrinsic and extrinsic semiconductors; Forward and reverse bias; Common emitter characteristics; Boolean expressions of gates
U Optics
C Ray Optics
S Reflection and Refraction
T Plane and spherical mirrors; Refraction and total internal reflection; Refraction at spherical surfaces; Thin lenses and combinations; Prism and dispersion
K Mirror formula; Critical angle; Lens maker's formula; Power of lens; Minimum deviation
S Optical Instruments
T Human eye and defects; Microscope; Telescope
K Magnifying power; Near point and far point
C Wave Optics
T Huygens' principle; Young's double slit experiment; Diffraction at a single slit; Polarisation and Brewster's law; Thin film interference
K Fringe width; Path difference and phase difference; Malus' law; Intensity distribution in interference
U Modern Physics
C Dual Nature of Radiation and Matter
T Photoelectric effect; de Broglie wavelength; Davisson-Germer experiment
K Einstein's photoelectric equation; Stopping potential; Threshold frequency; Matter waves
C Atoms and Nuclei
S Atomic Structure
T Bohr model of hydrogen atom; Hydrogen spectrum; X-rays
K Energy levels of hydrogen-like atoms; Spectral series; Moseley's law
S Nuclear Physics
T Radioactive decay; Binding energy and mass defect; Nuclear fission and fusion
K Half-life and decay constant; Activity; Mass-energy equivalence; Q-value of nuclear reaction

# Chemistry
U Physical Chemistry
C Some Basic Concepts of Chemistry
T Mole concept; Stoichiometry and limiting reagent; Concentration terms; Empirical and molecular formula
K Avogadro number and molar mass; Percentage yield; Molarity and molality; Equivalent concept
C Atomic Structure
T Bohr model; Quantum mechanical model; Quantum numbers and electronic configuration; Photoelectric effect and de Broglie
K Energy of electron in nth orbit; Heisenberg uncertainty principle; Aufbau, Pauli and Hund rules; Radial and angular nodes
C Chemical Bonding & Molecular Structure
T Ionic bonding and lattice energy; Covalent bonding and VSEPR; Hybridisation; Molecular orbital theory; Hydrogen bonding and intermolecular forces; Dipole moment
K Fajans' rule; Shapes of molecules; Bond order and magnetic behaviour; Bond angle comparison
C States of Matter
S Gaseous State
T Gas laws; Kinetic theory and molecular speeds; Real gases and van der Waals equation; Liquefaction of gases
K Ideal gas equation; Graham's law of diffusion; Compressibility factor; Critical constants
C Thermodynamics (Chemical)
T First law and enthalpy; Hess's law and enthalpy of reactions; Entropy and second law; Gibbs free energy and spontaneity
K Heat capacity relations; Bond enthalpy calculations; Gibbs energy and equilibrium constant
C Chemical Equilibrium
T Law of mass action and Kc, Kp; Le Chatelier's principle; Degree of dissociation
K Relation between Kp and Kc; Reaction quotient; Effect of temperature, pressure and concentration
C Ionic Equilibrium
T Acids, bases and pH; Buffer solutions; Solubility product; Hydrolysis of salts; Common ion effect
K pH of weak acid and base; Henderson-Hasselbalch equation; Precipitation condition; Polyprotic acids
C Redox Reactions
T Oxidation number; Balancing redox reactions; Equivalent weight and titration
K Ion-electron method; n-factor; Disproportionation
C Solutions
T Concentration terms and Raoult's law; Colligative properties; Van't Hoff factor; Azeotropes
K Relative lowering of vapour pressure; Elevation of boiling point and depression of freezing point; Osmotic pressure; Abnormal molar mass
C Electrochemistry
T Galvanic cells and Nernst equation; Electrolysis and Faraday's laws; Conductance and Kohlrausch law; Batteries and corrosion
K Cell potential and Gibbs energy; Equilibrium constant from EMF; Molar conductivity; Concentration cell
C Chemical Kinetics
T Rate law and order of reaction; Integrated rate equations; Half-life; Arrhenius equation; Collision theory and mechanism
K Pseudo first order reaction; Activation energy from two temperatures; Parallel and consecutive reactions
C Solid State
T Unit cells and packing efficiency; Crystal defects; Density of unit cell; Voids
K Coordination number; Schottky and Frenkel defects; Radius ratio rule
C Surface Chemistry
T Adsorption; Catalysis; Colloids and emulsions
K Freundlich isotherm; Enzyme catalysis; Coagulation and Hardy-Schulze rule
U Organic Chemistry
C General Organic Chemistry
S Electronic Effects
T Inductive effect; Resonance and mesomeric effect; Hyperconjugation; Electromeric effect
K Acidity and basicity comparison; Stability of carbocation, carbanion and free radical
S Reaction Intermediates and Mechanisms
T Nucleophiles and electrophiles; Types of organic reactions
K Reactivity trends
C Isomerism
S Structural Isomerism
T Chain, position and functional isomerism; Tautomerism
S Stereoisomerism
T Geometrical isomerism; Optical isomerism; Conformations
K Chirality and enantiomers; R/S and E/Z nomenclature; Newman projections
C IUPAC Nomenclature
T Naming alkanes and substituted compounds; Functional group priority
C Hydrocarbons
S Alkanes, Alkenes and Alkynes
T Preparation of alkanes; Electrophilic addition to alkenes; Reactions of alkynes; Ozonolysis
S Aromatic Hydrocarbons
T Benzene and aromaticity; Electrophilic aromatic substitution; Directing effects
K Huckel rule; Nitration and halogenation
C Haloalkanes and Haloarenes
T SN1 and SN2 mechanisms; Elimination reactions; Reactions of haloarenes
K Stereochemistry of SN2; Saytzeff rule; Reactivity order of alkyl halides
C Alcohols, Phenols and Ethers
T Preparation and properties of alcohols; Acidity of phenols; Reactions of ethers; Named reactions of phenols
K Lucas test; Kolbe and Reimer-Tiemann reactions; Williamson synthesis
C Aldehydes, Ketones and Carboxylic Acids
T Nucleophilic addition reactions; Aldol and Cannizzaro reactions; Acidity of carboxylic acids; Derivatives of carboxylic acids
K Reactivity of carbonyl compounds; Haloform reaction; Tests for aldehydes and ketones
C Amines and Diazonium Salts
T Basicity of amines; Hinsberg test; Diazonium salt reactions
K Basic strength order; Sandmeyer reaction; Coupling reactions
C Biomolecules and Polymers
T Carbohydrates; Amino acids and proteins; Nucleic acids and vitamins; Polymers
K Glucose structure; Zwitterion and isoelectric point; Addition and condensation polymers
C Named Reactions and Conversions
T Name reactions; Multi-step conversions; Reagents and their uses
K Wolff-Kishner and Clemmensen reduction; Hofmann bromamide reaction
U Inorganic Chemistry
C Periodic Table and Periodicity
T Classification of elements; Atomic and ionic radii; Ionisation enthalpy and electron gain enthalpy; Electronegativity; Diagonal relationship
K Effective nuclear charge; Anomalies in ionisation enthalpy; Trends across period and group
C s-Block Elements
T Alkali metals; Alkaline earth metals; Important compounds of sodium and calcium
K Anomalous behaviour of Li and Be; Solubility trends
C p-Block Elements
S Group 13 and 14
T Boron and its compounds; Carbon family
S Group 15 to 18
T Nitrogen and phosphorus compounds; Oxygen and sulphur compounds; Halogens and interhalogens; Noble gases
K Oxoacids of phosphorus; Ozone; Oxidising power of halogens; Xenon compounds
C d- and f-Block Elements
T Properties of transition elements; KMnO4 and K2Cr2O7; Lanthanoids and actinoids
K Magnetic moment spin-only; Colour of transition metal ions; Lanthanoid contraction
C Coordination Compounds
T Werner's theory and nomenclature; Isomerism in complexes; Valence bond theory; Crystal field theory
K Spectrochemical series; CFSE calculation; Hybridisation and geometry of complexes
C Metallurgy and Qualitative Analysis
T Extraction of metals; Ellingham diagram; Salt analysis and tests for ions
K Roasting, calcination and smelting; Flame tests

# Mathematics
U Algebra
C Sets, Relations & Functions
T Sets and Venn diagrams; Relations and their types; Functions: domain, range, composition; Inverse and types of functions
K Cardinality of sets; Equivalence relations; One-one and onto functions; Periodicity of functions
C Complex Numbers
T Algebra of complex numbers; Argand plane and polar form; De Moivre's theorem and roots of unity; Geometry of complex numbers
K Modulus and argument; Cube roots of unity; Locus in the Argand plane
C Quadratic Equations
T Roots and nature of roots; Relation between roots and coefficients; Location of roots; Quadratic inequalities
K Discriminant; Sum and product of roots; Wavy curve method
C Sequences and Series
T Arithmetic progression; Geometric progression; Harmonic progression and means; Special series
K Sum of n terms of AP and GP; AM-GM-HM inequality; Method of differences
C Permutations and Combinations
T Fundamental counting principle; Permutations; Combinations; Distribution and arrangement problems
K Circular permutations; Selection with repetition; Derangements
C Binomial Theorem
T General term and middle term; Binomial coefficients properties; Multinomial theorem
K Coefficient of a particular term; Sum of binomial coefficients
C Matrices and Determinants
S Matrices
T Types of matrices and operations; Adjoint and inverse; Rank and system of linear equations
S Determinants
T Properties of determinants; Cramer's rule
K Cofactor expansion; Consistency of linear systems
U Trigonometry
C Trigonometric Ratios and Identities
T Compound angle formulas; Multiple and sub-multiple angles; Transformation formulas; Conditional identities
K Sum to product conversion; Maximum and minimum of trigonometric expressions
C Trigonometric Equations
T General solutions; Equations involving multiple angles; Inequalities in trigonometry
C Inverse Trigonometric Functions
T Principal value branches; Properties of inverse trigonometric functions; Equations involving inverse trigonometry
C Properties of Triangles
T Sine and cosine rule; Area and centres of triangle; Heights and distances
K Circumradius and inradius; Projection formula
U Coordinate Geometry
C Straight Lines
T Slope and equations of lines; Distance of point from line; Angle between lines and bisectors; Family of lines
C Circles
T Equation of circle; Tangents and normals; Radical axis and family of circles; Common tangents
K Position of point and line relative to circle; Chord of contact
C Conic Sections
S Parabola
T Standard equation and properties; Tangent and normal to parabola
S Ellipse
T Standard equation and properties of ellipse; Tangent and normal to ellipse
S Hyperbola
T Standard equation and properties of hyperbola; Asymptotes and rectangular hyperbola
U Differential Calculus
C Limits, Continuity and Differentiability
T Limits and standard expansions; L'Hopital's rule; Continuity; Differentiability
K Sandwich theorem; Left and right hand limits; Differentiability of modulus function
C Differentiation
T Chain rule and implicit differentiation; Parametric and logarithmic differentiation; Higher order derivatives
C Application of Derivatives
S Tangents and Normals
T Equation of tangent and normal; Angle between curves
S Monotonicity and Extrema
T Increasing and decreasing functions; Maxima and minima; Rolle's and Lagrange's mean value theorem; Optimisation problems
K First derivative test; Second derivative test; Global maximum on closed interval
U Integral Calculus
C Indefinite Integration
T Standard integrals and substitution; Integration by parts; Partial fractions; Integration of trigonometric and irrational functions
K ILATE rule; Reduction formulas
C Definite Integration
S Evaluation of Definite Integrals
T Fundamental theorem of calculus; Substitution in definite integrals; Definite integral as limit of a sum
S Properties of Definite Integrals
T King's property
T Symmetry/Substitution Property
ST Even and odd function over symmetric limits
K Applying limits and transformation
T Periodic function property; Integrals of modulus and greatest integer functions; Leibniz rule and inequalities
K Walli's formula; Estimating integral bounds
C Area Under Curves
T Area bounded by curves; Area between two curves
C Differential Equations
T Order and degree; Variable separable; Homogeneous and linear differential equations; Formation of differential equations
K Integrating factor; Orthogonal trajectories
U Vectors and 3D Geometry
C Vector Algebra
T Dot and cross product; Scalar triple product; Vector triple product; Geometry using vectors
K Projection of a vector; Coplanarity of vectors
C Three Dimensional Geometry
T Direction cosines and ratios; Lines in space; Planes; Shortest distance and angle between lines and planes
U Probability and Statistics
C Probability
T Classical probability; Conditional probability and Bayes' theorem; Random variables and probability distributions; Binomial distribution
K Independent events; Total probability theorem; Mean and variance of distribution
C Statistics
T Mean, median and mode; Variance and standard deviation
`;
