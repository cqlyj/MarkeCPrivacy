// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.28;

import {ERC721URIStorage, ERC721} from "openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";

contract TeamNFT is ERC721URIStorage, AccessControl {
    // Roles definitions
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    // Token counter for incremental token IDs
    uint256 private _tokenIdCounter;

    /// @notice Deploys the TeamNFT contract
    /// @param admin The address that will receive the DEFAULT_ADMIN_ROLE
    /// @param minter The address that will receive the MINTER_ROLE (can mint new NFTs)
    /// @param agent The address that will receive the AGENT_ROLE (can update metadata)
    constructor(
        address admin,
        address minter,
        address agent
    ) ERC721("EthGlobal New York 2025", "ETHNYC2025") {
        require(admin != address(0), "Admin address cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        if (minter != address(0)) {
            _grantRole(MINTER_ROLE, minter);
        }
        if (agent != address(0)) {
            _grantRole(AGENT_ROLE, agent);
        }
    }

    /// @notice Mints a new NFT to `to` with metadata `tokenURI_`.
    /// @dev Only accounts with MINTER_ROLE can call this function.
    /// @param to The recipient address.
    /// @param tokenURI_ The URI pointing to the token metadata JSON.
    function mint(
        address to,
        string memory tokenURI_
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        uint256 tokenId = ++_tokenIdCounter; // start tokenId at 1
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);
        return tokenId;
    }

    /// @notice Updates the metadata URI of an existing token.
    /// @dev Only accounts with AGENT_ROLE can call this function.
    /// @param tokenId The ID of the token to update.
    /// @param newTokenURI The new metadata URI.
    function updateMetadata(
        uint256 tokenId,
        string memory newTokenURI
    ) external onlyRole(AGENT_ROLE) {
        _setTokenURI(tokenId, newTokenURI);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
