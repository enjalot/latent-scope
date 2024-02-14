
import './Mobile.css';

function Mobile() {
  return (
    <div className="mobile-message-page">
      <div className="mobile-header">
        Latentscope is designed to be used on a desktop computer. Please use a desktop computer to access this page.
      </div>
      <div className="mobile-content">
        Latentscope is meant to be used with relatively larger datasets, setup for either local computation or on-prem or a trusted cloud server. 
        It is a workflow & tool combined for processing and exploring large amounts of text. Please come back on a desktop and try installing it locally!
        {/* TODO: nice preview image <img src></img> */}
        {/* TODO: youtube embed */}
        <br/>
        <br/>
        <a href="https://github.com/enjalot/latent-scope">GitHub repository</a>
      </div>
    </div>
  );
}

export default Mobile;
