// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

contract ERC721Demo is ERC721 {
    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_){}
    function mint(uint256 tokenId) external{
        _safeMint(_msgSender(), tokenId);
    }
}