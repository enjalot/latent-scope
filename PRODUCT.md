# Latent Scope

## What it is

An open-source local tool for exploring embedding datasets: embed → UMAP → cluster → label →
scope. A WebGL scatterplot map is the hero surface, surrounded by dense panels (cluster
labels, filters, data tables), a multi-step Setup pipeline, Jobs monitoring, and Compare
views. Python backend (Flask/waitress, `ls-serve`), React + Vite frontend in `web/`.

## Users

ML/data practitioners running long analysis sessions on their own machines. They are fluent
in tools like Observable, Linear, Jupyter — they trust precise, quiet, dense interfaces and
distrust decoration.

## Register

**Product** — design serves the task. The data is the star; chrome recedes and frames it
like a scientific instrument.

## Platform

Web (desktop-first, with a mobile Explore variant). Light and dark via
`prefers-color-scheme`; dark is where the tool lives most.

## Design direction

"Amber Console" — see [DESIGN.md](DESIGN.md). Terminal-native futurism: warm graphite
surfaces, one amber phosphor accent (the copper brand re-tuned per mode), IBM Plex Sans for
language, IBM Plex Mono for everything the machine measured, status-diode light language,
three restrained sci-fi signatures. Coherence over novelty; every affordance standard.
