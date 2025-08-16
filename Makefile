-include .env

install:
	@forge install OpenZeppelin/openzeppelin-contracts 

deploy:
	@forge script script/DeployTeamNFT.s.sol:DeployTeamNFT --rpc-url $(FLOW_RPC_URL) --account burner --sender 0xFB6a372F2F51a002b390D18693075157A459641F --broadcast -vvvv
