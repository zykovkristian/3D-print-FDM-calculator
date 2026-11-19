# MVS Calibrator

## Make FDM print limits understandable

Print speed is constrained by more than the printer's headline specification. Motion, acceleration, melt capacity, filament behavior, cooling, and layer height all matter. MVS Calibrator brings these limits into one browser-based calculator and connects estimates to a structured measurement protocol.

The project includes a print-limit model, a ten-step calibration protocol, and an MVS matrix generator that creates a continuous spiral path and G-code using G2/G3 arcs. The current matrix preset uses five spirals with volumetric-speed steps of 8, 12, 16, 20, and 24.

The calculator explains which constraint is active, plots limits by layer height, explores parameter sensitivity, and suggests values for Bambu Studio. The tools run locally in a browser without a build step or account.

Personal and other permitted noncommercial use is free under PolyForm Noncommercial 1.0.0. Organizations need a separate commercial license; terms are available by request. The project does not control a printer and does not replace material- and machine-specific calibration.

Try the tools, inspect the documented method, and contribute improvements through the public repository.
