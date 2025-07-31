import '/src/pages/components/HeaderTemplate/header.css';

import {BiSearch} from 'react-icons/bi';

const Header = () => {
    return (
        <div className='header'>
            Header

            <div className="search-bar">
                <input type="text" placeholder='Search...' />
                <BiSearch className='icon' />
            </div>

            <div className="tools"></div>
        </div>
    );
};

export default Header;
