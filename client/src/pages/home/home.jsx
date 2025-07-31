import '/src/pages/home/home.css'
import Nav from '/src/pages/navigation/nav.jsx'
import MainPage from '/src/pages/main/main-page.jsx'

function Home() {

  return (
    <>
      <div className="Home">
        <Nav />

        <MainPage />
      </div>
      
    </>
  )
  
}

export default Home
