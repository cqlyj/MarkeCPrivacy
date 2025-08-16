// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TeamNFT} from "../src/TeamNFT.sol";

contract DeployTeamNFT is Script {
    function run() public {
        vm.startBroadcast();
        address teamNFT = address(
            new TeamNFT(msg.sender, msg.sender, msg.sender)
        );
        vm.stopBroadcast();

        console.log("TeamNFT deployed to:", teamNFT);
    }
}
