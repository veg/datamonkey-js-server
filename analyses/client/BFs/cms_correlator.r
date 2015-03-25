# use with $R --no-save -q --file=Correlator.r --slave --args path_to/file_reliability.csv

#inArgs<-commandArgs(trailingOnly='TRUE');

cms_plots <- function ( filename ) 
{
	xwidth = 5;
	yheight = 5;
	
	rates<-read.csv (filename)
	PS_filename_1 <- paste ( filename, ".stanfel.ps", sep="" ); 
	PS_filename_2 <- paste ( filename, ".charge.ps", sep="" ); 
	PS_filename_3 <- paste ( filename, ".polarity.ps", sep="" ); 
	PS_filename_4 <- paste ( filename, ".correl.ps", sep="" ); 
	
	
	postscript(PS_filename_1, width=xwidth,height=yheight,paper="special",horizontal=FALSE,onefile=FALSE);
	w1<-wilcox.test (rates$Averaged[rates$StanfelChange==0],rates$Averaged[rates$StanfelChange==1], alternative="less");
	boxplot(rates$Averaged[rates$StanfelChange==0],rates$Averaged[rates$StanfelChange==1],names=c("Yes","No"),main="Stanfel Class Change",ylab="Model-averaged substitution rate",xlab=paste("Wilcoxson one sided p =",format(w1$p.value,digits=2)));
	
	postscript(PS_filename_2, width=xwidth,height=yheight,paper="special",horizontal=FALSE,onefile=FALSE);
	w3<-wilcox.test (rates$Averaged[rates$ChargeChange==0],rates$Averaged[rates$ChargeChange==1], alternative="less")
	boxplot(rates$Averaged[rates$ChargeChange==0],rates$Averaged[rates$ChargeChange==1],names=c("Yes","No"),main="Charge Change",ylab="Model-averaged substitution rate",xlab=paste("Wilcoxson one sided p =",format(w3$p.value,digits=2)))

	postscript(PS_filename_3, width=xwidth,height=yheight,paper="special",horizontal=FALSE,onefile=FALSE);
	w2<-wilcox.test (rates$Averaged[rates$PolarityChange==0],rates$Averaged[rates$PolarityChange==1], alternative="less");
	boxplot(rates$Averaged[rates$PolarityChange==0],rates$Averaged[rates$PolarityChange==1],names=c("Yes","No"),main="Polarity Change",ylab="Model-averaged substitution rate",xlab=paste("Wilcoxson one sided p =",format(w2$p.value,digits=2)))
	
	postscript(PS_filename_4, width=xwidth,height=yheight,paper="special",horizontal=FALSE,onefile=FALSE);
	span<-(max(rates[4])+min(rates[4]))/2;
	matplot(rates[4],rates[8:12],type="p",pch=0:5,col="black",xlab="Model averaged substitution rate",ylab="Property-based distance",main="Rate:property correlation");
	corrp<-c(0:4)
	catnames<-c("Chemical composition","Polarity","Volume","Isoelectric point","Hydropathy")
	for(i in 8:12) corrp[i-7]<-paste(catnames[i-7]," (p=",format(cor.test(rates[1:nrow(rates),4],rates[1:nrow(rates),i],method="kendall",alt="less")$p.value,digits=2),")",sep="")
	legend(span,13, corrp,pch=0:5,col="black",xjust=0.5,yjust=0.5,cex=0.75);

}