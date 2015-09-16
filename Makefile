.PHONY: clean all test publish

test:
	@npm test

install:
	@mkdir -p ./.python
	@virtualenv-3.4 ./.python/env/
	@./.python/env/bin/pip install numpy
	@./.python/env/bin/pip install biopython
	@./.python/env/bin/pip install git+git://github.com/veg/hivtrace.git@master --process-dependency-links --upgrade
	@git clone git@github.com:veg/flea-pipeline.git ./.python/flea-pipeline --upgrade
	@git clone git@github.com:veg/hyphy.git ./.hyphy/
	@npm install

