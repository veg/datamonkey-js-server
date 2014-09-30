<script type="text/javascript" src="http://www.datamonkey.org/wz_tooltip.js"></script>

<SCRIPT LANGUAGE = "JavaScript" type="text/javascript">

DATAMONKEYTOOLTIPS	
	var freq_tt_strings = new Array();
	freq_tt_strings [0] = 'Use fixed frequencies derived from the original dataset';
	freq_tt_strings [1] = 'Use frequencies estimated from your alignment (+F option with 19 extra parameters)';
	
    function populateForm () {
        ONLOAD_HANDLER;
    }
	
	function toggleBox(szDivID, iState) // 1 visible, 0 hidden
	{
		var ele = document.getElementById(szDivID);
		if(iState == 0) {
				ele.style.display = "none";
		}
		else {
			ele.style.display = "block";
		}
	}

	function SetNamedModel(model, freq)
	{
		modelForm.ratematrix.selectedIndex = model;
		modelForm.frequencies.selectedIndex = freq;
	}
	

	function SetMethodByValue(v)
	{
		for (k=0; k<modelForm.method.options.length;k++)
		{
			if (modelForm.method.options[k].value == v)
			{
				modelForm.method.selectedIndex = k;
				break;
			}
		}
	}

	function setBF()
	{
		checkValue = parseFloat (modelForm.pValue.value);
		selMethodV = modelForm.method.options[modelForm.method.selectedIndex].value;
		toggleBox ( "protein1",  selMethodV != 60 );
		toggleBox ( "protein2",  selMethodV == 60);
		toggleBox ("ambChoice",  selMethodV==0 || selMethodV==6);
		toggleBox ("sigLevel",   selMethodV < 5);
		toggleBox ("rvoptions",  selMethodV >=20 && selMethodV != 60 && selMethodV != 61);
		toggleBox ("rvoptionsNoConstant", selMethodV == 60 );
		toggleBox ("rootOn",  	 selMethodV == 22 || selMethodV == 60 || selMethodV == 61 );
		toggleBox ("treeMode",   selMethodV == 22 || selMethodV == 1 || selMethodV == 2 || selMethodV == 0 || selMethodV == 60 || selMethodV == 61);
			
		if (selMethodV == 3)
		{
			if (checkValue < 1.0)
				modelForm.pValue.value = 50;
		}
		else
		{
			if (selMethodV < 3 || selMethodV == 4)
			{
				if (checkValue >= 0.5)
					modelForm.pValue.value = 0.1;		
			}
			else
			{
				if (selMethodV == 6)
				{
					if (checkValue >= 1.0 || checkValue < 0.5)
						modelForm.pValue.value = 0.5;		
				}				
			}
		}
	}
	
	function flagOddValues()
	{
		checkValue = parseFloat (modelForm.pValue.value);
		selMethodV = modelForm.method.options[modelForm.method.selectedIndex].value;
		if (selMethodV<5 && selMethodV != 3)
		{
			if (checkValue > 0.25)
			{
				alert ("Warning: p-values for SLAC, FEL, IFEL and PARRIS should be small (e.g. p<=0.25), since they measure the probability of observing large (or small) dN/dS in random neutral data.");
			}
		}
		else
		{
			if (selMethodV == 3)
			{
				if (checkValue < 10 && modelForm.method.selectedIndex<5)
				{
					alert ("Warning: Bayes Factors for the REL test should be large (>=10), since they measure the effect of the data on our prior beliefs.");
				}	
			}
			else
			{
				if (checkValue < 0.5 || checkValue > 1.0)
				{
					alert ("Warning: Posterior probability for Spidermonkey/BGM analyses must be between 0 and 1 and generally be greater than 0.5");
				}
			}
		}
	}
	
	function CheckValidDnDS()
	{
		checkValue = parseFloat (modelForm.pValue.value);
		selMethodV = modelForm.method.options[modelForm.method.selectedIndex].value;
		if (selMethodV<3 || selMethodV==4)
		{
			if ((checkValue <= 0.0)||(checkValue>=1.0))
			{
				alert ("User supplied p-value must be in (0,1).");
				return false;
			}
		}
		else
		{
			if (selMethodV == 3)
			{	
				if (checkValue <= 1.0)
				{
					alert ("User supplied Bayes Factor must be > 1.");
					return false;	
				}
			}	
			else
			{
				if (selMethodV == 6)
				{	
					if ((checkValue <= 0.0)||(checkValue>=1.0))
					{
						alert ("User supplied posterior probability must be in (0,1).");
						return false;
					}
				}
			}		
	
		}
		if (modelForm.rOptions.selectedIndex==1)
		{
			checkValue = parseFloat (modelForm.dNdS.value);
			if (checkValue <= 0.0)
			{
				alert ("User supplied dN/dS value must be positive");
				return false;
			}
		}
		else
		{
			modelForm.dNdS.value = "1.0";
		}
		
		modelSpec = modelForm.AC.options[modelForm.AC.selectedIndex].value+"1";
		modelSpec += modelForm.AT.options[modelForm.AT.selectedIndex].value;
		modelSpec += modelForm.CG.options[modelForm.CG.selectedIndex].value;
		modelSpec += modelForm.CT.options[modelForm.CT.selectedIndex].value;
		modelSpec += modelForm.GT.options[modelForm.GT.selectedIndex].value;
		
		modelForm.modelString.value = modelSpec;
		return true;
	}
</SCRIPT>
