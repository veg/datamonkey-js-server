.PHONY: clean all test publish

test:
	@npm test

install:
	@mkdir -p ./.python
	@virtualenv-3.4 ./.python/env/
	@./.python/env/bin/pip install numpy
	@./.python/env/bin/pip install biopython
	@./.python/env/bin/pip install git+git://github.com/veg/hivtrace.git@master --process-dependency-links
	@npm install

