.PHONY: clean all test publish

test:
	@npm test

hyphy:
	echo "installing hyphy"
	@if ! test -d ./.hyphy; then git clone git@github.com:veg/hyphy.git ./.hyphy/; fi
	@if ! test -d ./.hyphy-2.3.3;then git clone git@github.com:veg/hyphy.git ./.hyphy-2.3.3/; fi
	@cd ./.hyphy-2.3.3 && cmake . && make HYPHYMP && cd ../
	@cd ./.hyphy && cmake . && make HYPHYMP && cd ../

hivtrace:
	@mkdir -p ./.python
	@virtualenv-3.4 ./.python/env/
	@./.python/env/bin/pip install numpy
	@./.python/env/bin/pip install biopython
	@./.python/env/bin/pip install hivtrace

npm:
	echo "running npm"
	@npm install

install: hyphy npm

