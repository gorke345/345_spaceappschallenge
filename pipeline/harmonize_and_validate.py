#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TURQUA // FIRE HARMONY — Multi-Satellite Reproducible Pipeline
NASA Space Apps Challenge 2026: Harmonization of MODIS and VIIRS Hot Spots

Wrapper executing the empirical pipeline in pipeline/run_all.py.
Zero hardcoded data constants. All metrics computed from real FIRMS records.
"""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_all import main

if __name__ == "__main__":
    main()
