"""Build script for Cython extensions.

Usage:
    python setup_cython.py build_ext --inplace
"""
from setuptools import setup, Extension
from Cython.Build import cythonize
import numpy as np

extensions = [
    Extension(
        "pipeline.cython_detect",
        ["pipeline/cython_detect.pyx"],
        include_dirs=[np.get_include()],
    )
]

setup(
    packages=[],
    ext_modules=cythonize(extensions, compiler_directives={"language_level": "3"}),
)
